import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, Prisma, type ApprovalStatus, type PolicyVersion } from '@topiadesk/db';
import { decimalToString } from './decimal.util';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { enqueueSurveyInvitesForPolicyVersion } from '../case-management/survey-dispatch-queue';
import { CreatePolicyVersionDto } from './dto/create-policy-version.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { PolicyVersionResponseDto } from './dto/policy-version-response.dto';
import {
  assertKycValidForRenewal,
  assertValidPolicyTransition,
  isApprovalGated,
  resolveApprovalThreshold,
  VERSION_TYPE_APPROVAL_ENTITY_TYPE,
  VERSION_TYPE_STATUS_EFFECT,
} from './policy-lifecycle';

function toVersionDto(
  version: PolicyVersion,
  approvalStatus: ApprovalStatus | null,
  applied: boolean,
  chainProgress?: { approvedCount: number; requiredApprovals: number },
): PolicyVersionResponseDto {
  return {
    ...version,
    premiumImpact: decimalToString(version.premiumImpact),
    sumInsuredAtVersion: decimalToString(version.sumInsuredAtVersion),
    approvalStatus,
    applied,
    approvedCount: chainProgress?.approvedCount,
    requiredApprovals: chainProgress?.requiredApprovals,
  };
}

/**
 * PolicyVersion = the mechanism for recording issuance/endorsement/renewal/
 * cancellation/reinstatement. Per the BRD's compliance requirement
 * (segregation of duties), ENDORSEMENT and CANCELLATION versions do NOT
 * apply immediately: creating one always writes the PolicyVersion row (a
 * durable record of what was proposed, even if later rejected) plus a
 * PENDING Approval; the version's effect on the Policy itself
 * (currentVersionId/status/sumInsured) is applied only once that Approval
 * is decided via POST .../decision. ISSUANCE/RENEWAL/REINSTATEMENT apply
 * immediately — see policy-lifecycle.ts for the full rule and rationale.
 */
@ApiTags('policy')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('policies/:policyId/versions')
export class PolicyVersionController {
  @Get()
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: [PolicyVersionResponseDto] })
  async list(@Param('policyId', ParseUUIDPipe) policyId: string): Promise<PolicyVersionResponseDto[]> {
    await this.assertPolicyVisible(policyId);
    const versions = await getPrismaClient().policyVersion.findMany({
      where: { policyId },
      orderBy: { versionNumber: 'asc' },
    });
    return Promise.all(versions.map((v) => this.withApprovalStatus(v)));
  }

  @Get(':versionId')
  @RequirePermission('policy', 'read')
  @ApiOkResponse({ type: PolicyVersionResponseDto })
  async findOne(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<PolicyVersionResponseDto> {
    const version = await getPrismaClient().policyVersion.findFirst({ where: { id: versionId, policyId } });
    if (!version) throw new NotFoundException('Policy version not found');
    return this.withApprovalStatus(version);
  }

  @Post()
  @RequirePermission('policy', 'write')
  @ApiOkResponse({ type: PolicyVersionResponseDto })
  async create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreatePolicyVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyVersionResponseDto> {
    const prisma = getPrismaClient();
    const policy = await prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException('Policy not found');

    if (dto.versionType === 'RENEWAL') {
      const account = await prisma.account.findUniqueOrThrow({
        where: { id: policy.accountId },
        select: { kycStatus: true, kycExpiryDate: true },
      });
      try {
        assertKycValidForRenewal(account);
      } catch (err) {
        if (err instanceof BadRequestException) {
          // Self-notification only — RLS's notifications_rw WITH CHECK
          // requires recipientUserId to equal the current session's user
          // outside a SYSTEM_JOB context (see NotificationsService's header
          // comment), so this can only notify the person who just attempted
          // the blocked action, not e.g. the account owner if different.
          await prisma.notification
            .create({
              data: {
                recipientUserId: user.id,
                type: 'KYC_BLOCKED_RENEWAL',
                title: 'Renewal quote blocked — KYC required',
                body: (err.getResponse() as { message?: string })?.message ?? err.message,
                channel: 'IN_APP',
                dedupeKey: `kyc-blocked-renewal:${policyId}:${new Date().toISOString().slice(0, 10)}`,
                relatedEntityType: 'policy',
                relatedEntityId: policyId,
              },
            })
            .catch((notifyErr) => {
              // P2002 on dedupeKey = already notified today for this policy — a healthy no-op, not an error.
              if (!(notifyErr instanceof Prisma.PrismaClientKnownRequestError && notifyErr.code === 'P2002')) throw notifyErr;
            });
        }
        throw err;
      }
    }

    const targetStatus = VERSION_TYPE_STATUS_EFFECT[dto.versionType];
    // Fail fast at request time even for gated types — re-validated again
    // at decision time in decideApproval() since policy state can drift
    // between now and whenever an approver acts on it.
    assertValidPolicyTransition(policy.status, targetStatus);

    const maxVersion = await prisma.policyVersion.aggregate({ where: { policyId }, _max: { versionNumber: true } });
    const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

    const version = await prisma.policyVersion.create({
      data: {
        policyId,
        versionNumber,
        versionType: dto.versionType,
        effectiveDate: new Date(dto.effectiveDate),
        changeDescription: dto.changeDescription,
        premiumImpact: dto.premiumImpact,
        sumInsuredAtVersion: dto.sumInsuredAtVersion,
        documentId: dto.documentId,
        createdById: user.id,
      },
    });

    if (isApprovalGated(dto.versionType)) {
      const entityType = VERSION_TYPE_APPROVAL_ENTITY_TYPE[dto.versionType]!;
      // Threshold-routed multi-level chain vs. the plain single-approval
      // path — resolved off whichever amount this version actually carries
      // (premiumImpact for endorsements, sumInsuredAtVersion for
      // cancellations tend to be the more common one set per type, but
      // either can be present; premiumImpact wins if both are).
      const amount = dto.premiumImpact != null ? Number(dto.premiumImpact) : dto.sumInsuredAtVersion != null ? Number(dto.sumInsuredAtVersion) : null;
      const requiredApprovals = await resolveApprovalThreshold(dto.versionType, amount);

      if (requiredApprovals > 1) {
        await prisma.approvalChain.create({
          data: { entityType, entityId: version.id, requiredApprovals, status: 'PENDING' },
        });
        return toVersionDto(version, 'PENDING', false, { approvedCount: 0, requiredApprovals });
      }

      await prisma.approval.create({
        data: { entityType, entityId: version.id, requestedById: user.id, status: 'PENDING' },
      });
      return toVersionDto(version, 'PENDING', false);
    }

    await prisma.policy.update({
      where: { id: policyId },
      data: {
        currentVersionId: version.id,
        status: targetStatus,
        sumInsured: dto.sumInsuredAtVersion ?? undefined,
      },
    });

    if (dto.versionType === 'ISSUANCE' || dto.versionType === 'RENEWAL') {
      await enqueueSurveyInvitesForPolicyVersion(version.id, dto.versionType === 'ISSUANCE' ? 'POLICY_ISSUED' : 'POLICY_RENEWED');
    }

    return toVersionDto(version, null, true);
  }

  @Post(':versionId/decision')
  @RequirePermission('approval', 'write')
  @ApiOkResponse({ type: PolicyVersionResponseDto })
  async decideApproval(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyVersionResponseDto> {
    const prisma = getPrismaClient();
    const version = await prisma.policyVersion.findFirst({ where: { id: versionId, policyId } });
    if (!version) throw new NotFoundException('Policy version not found');
    if (!isApprovalGated(version.versionType)) {
      throw new BadRequestException(`${version.versionType} versions are applied immediately and have no approval to decide`);
    }

    const entityType = VERSION_TYPE_APPROVAL_ENTITY_TYPE[version.versionType]!;

    // Multi-level chain (requiredApprovals > 1 at creation time) vs. the
    // plain single-Approval path — mutually exclusive per version, decided
    // once at creation and never after (see create()).
    const chain = await prisma.approvalChain.findFirst({ where: { entityType, entityId: versionId, status: 'PENDING' } });
    if (chain) {
      return this.decideChainedApproval(policyId, version, chain.id, chain.requiredApprovals, dto, user);
    }

    const approval = await prisma.approval.findFirst({
      where: { entityType, entityId: versionId, status: 'PENDING', chainId: null },
    });
    if (!approval) throw new NotFoundException('No pending approval for this version');

    // Segregation of duties (BRD NFR) — the DB CHECK constraint
    // (approvals_requester_ne_approver, prisma/rls/003_check_constraints.sql)
    // would also reject this, but a clear 403 here beats a raw constraint
    // violation surfacing as a 500.
    if (approval.requestedById === user.id) {
      throw new ForbiddenException('Cannot decide your own approval request');
    }

    const policy = await prisma.policy.findUniqueOrThrow({ where: { id: policyId } });
    const targetStatus = VERSION_TYPE_STATUS_EFFECT[version.versionType];

    if (dto.decision === 'APPROVED') {
      // Re-validate: policy state may have moved since the version was
      // requested (e.g. someone else cancelled it in the meantime).
      assertValidPolicyTransition(policy.status, targetStatus);

      await prisma.approval.update({
        where: { id: approval.id },
        data: { status: 'APPROVED', approvedById: user.id, decidedAt: new Date(), reason: dto.reason },
      });
      await prisma.policy.update({
        where: { id: policyId },
        data: {
          currentVersionId: version.id,
          status: targetStatus,
          sumInsured: version.sumInsuredAtVersion ?? undefined,
        },
      });
      return toVersionDto(version, 'APPROVED', true);
    }

    await prisma.approval.update({
      where: { id: approval.id },
      data: { status: 'REJECTED', approvedById: user.id, decidedAt: new Date(), reason: dto.reason },
    });
    return toVersionDto(version, 'REJECTED', false);
  }

  /**
   * Each decision on a chain appends its OWN Approval row (chainId set)
   * rather than mutating a single shared row — that's what lets N different
   * approvers each leave an independent, attributable decision. The chain
   * itself (not any one row) is the source of truth for whether the version
   * applies: REJECTED the instant any one approver rejects; APPROVED only
   * once `requiredApprovals` distinct APPROVED rows exist.
   */
  private async decideChainedApproval(
    policyId: string,
    version: PolicyVersion,
    chainId: string,
    requiredApprovals: number,
    dto: DecideApprovalDto,
    user: AuthenticatedUser,
  ): Promise<PolicyVersionResponseDto> {
    const prisma = getPrismaClient();
    // version.createdById is the actual requester here — a chained version
    // never gets its own upfront Approval row the way a single-approval one
    // does (see create()), so this is the segregation-of-duties check's
    // equivalent for the chain path.
    if (version.createdById === user.id) {
      throw new ForbiddenException('Cannot decide your own approval request');
    }
    const alreadyDecided = await prisma.approval.findFirst({ where: { chainId, approvedById: user.id } });
    if (alreadyDecided) {
      throw new ForbiddenException('You have already decided on this approval chain');
    }

    const entityType = VERSION_TYPE_APPROVAL_ENTITY_TYPE[version.versionType]!;

    if (dto.decision === 'REJECTED') {
      await prisma.approval.create({
        data: {
          entityType,
          entityId: version.id,
          requestedById: version.createdById,
          approvedById: user.id,
          status: 'REJECTED',
          decidedAt: new Date(),
          reason: dto.reason,
          chainId,
        },
      });
      await prisma.approvalChain.update({ where: { id: chainId }, data: { status: 'REJECTED' } });
      return toVersionDto(version, 'REJECTED', false, { approvedCount: 0, requiredApprovals });
    }

    const policy = await prisma.policy.findUniqueOrThrow({ where: { id: policyId } });
    const targetStatus = VERSION_TYPE_STATUS_EFFECT[version.versionType];
    assertValidPolicyTransition(policy.status, targetStatus);

    await prisma.approval.create({
      data: {
        entityType,
        entityId: version.id,
        requestedById: version.createdById,
        approvedById: user.id,
        status: 'APPROVED',
        decidedAt: new Date(),
        reason: dto.reason,
        chainId,
      },
    });
    const approvedCount = await prisma.approval.count({ where: { chainId, status: 'APPROVED' } });

    if (approvedCount < requiredApprovals) {
      return toVersionDto(version, 'PENDING', false, { approvedCount, requiredApprovals });
    }

    await prisma.approvalChain.update({ where: { id: chainId }, data: { status: 'APPROVED' } });
    await prisma.policy.update({
      where: { id: policyId },
      data: { currentVersionId: version.id, status: targetStatus, sumInsured: version.sumInsuredAtVersion ?? undefined },
    });
    return toVersionDto(version, 'APPROVED', true, { approvedCount, requiredApprovals });
  }

  private async assertPolicyVisible(policyId: string): Promise<void> {
    const policy = await getPrismaClient().policy.findUnique({ where: { id: policyId }, select: { id: true } });
    if (!policy) throw new NotFoundException('Policy not found');
  }

  private async withApprovalStatus(version: PolicyVersion): Promise<PolicyVersionResponseDto> {
    if (!isApprovalGated(version.versionType)) return toVersionDto(version, null, true);
    const prisma = getPrismaClient();
    const entityType = VERSION_TYPE_APPROVAL_ENTITY_TYPE[version.versionType]!;

    const chain = await prisma.approvalChain.findFirst({ where: { entityType, entityId: version.id } });
    if (chain) {
      const approvedCount = await prisma.approval.count({ where: { chainId: chain.id, status: 'APPROVED' } });
      return toVersionDto(version, chain.status, chain.status === 'APPROVED', { approvedCount, requiredApprovals: chain.requiredApprovals });
    }

    const approval = await prisma.approval.findFirst({
      where: { entityType, entityId: version.id },
      orderBy: { createdAt: 'desc' },
    });
    return toVersionDto(version, approval?.status ?? null, approval?.status === 'APPROVED');
  }
}
