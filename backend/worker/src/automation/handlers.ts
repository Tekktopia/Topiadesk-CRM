import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@topiadesk/db';
import { registerActionHandler } from './action-handler';
import { isValidCaseTransition, isValidClaimTransition } from './lifecycle-transitions';

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`action param "${key}" must be a non-empty string`);
  }
  return value;
}

/**
 * SET_STATUS — params: { status: string }. Validates the transition and
 * writes ClaimStatusHistory the same as the API's handler, but deliberately
 * does NOT run SLA clock pause/resume/satisfy bookkeeping (that lives in
 * backend/api/.../sla-clock.util.ts, which depends on business-hours.util.ts
 * — reproducing the full SLA engine here for the AutomationRule path was
 * judged out of scope for this build; a RESOLUTION/STAGE_TRANSITION clock
 * left RUNNING after an automation-driven status change will still resolve
 * correctly via the breach-scan job's simple `dueAt <= now()` check, it just
 * won't be proactively marked SATISFIED/PAUSED early). Flagged in the
 * module report as a known follow-up.
 */
registerActionHandler({
  actionType: 'SET_STATUS',
  async execute(params, ctx) {
    const status = requireString(params, 'status');
    const prisma = getPrismaClient();
    if (ctx.entity.entityType === 'CLAIM') {
      const claim = await prisma.claim.findUnique({ where: { id: ctx.entity.claimId } });
      if (!claim) throw new Error(`Claim ${ctx.entity.claimId} not found`);
      if (!isValidClaimTransition(claim.status, status)) {
        throw new Error(`Cannot transition claim status from ${claim.status} to ${status}`);
      }
      if (claim.status === status) return;
      await prisma.claim.update({
        where: { id: ctx.entity.claimId },
        data: { status: status as never, settledAt: status === 'SETTLED' ? new Date() : undefined },
      });
      await prisma.claimStatusHistory.create({
        data: { claimId: ctx.entity.claimId, fromStatus: claim.status, toStatus: status as never, reason: `Applied via automation rule${ctx.systemJobName ? ` (${ctx.systemJobName})` : ''}` },
      });
    } else {
      const kase = await prisma.case.findUnique({ where: { id: ctx.entity.caseId } });
      if (!kase) throw new Error(`Case ${ctx.entity.caseId} not found`);
      if (!isValidCaseTransition(kase.status, status)) {
        throw new Error(`Cannot transition case status from ${kase.status} to ${status}`);
      }
      if (kase.status === status) return;
      const now = new Date();
      await prisma.case.update({
        where: { id: ctx.entity.caseId },
        data: {
          status: status as never,
          resolvedAt: status === 'RESOLVED' ? now : undefined,
          closedAt: status === 'CLOSED' ? now : undefined,
        },
      });
    }
  },
});

/** ASSIGN_TO_USER — params: { userId: string }. */
registerActionHandler({
  actionType: 'ASSIGN_TO_USER',
  async execute(params, ctx) {
    const userId = requireString(params, 'userId');
    const prisma = getPrismaClient();
    if (ctx.entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: ctx.entity.claimId }, data: { adjusterId: userId } });
    } else {
      await prisma.case.update({ where: { id: ctx.entity.caseId }, data: { assignedToId: userId } });
    }
  },
});

/** ASSIGN_TO_TEAM — params: { teamId: string }. */
registerActionHandler({
  actionType: 'ASSIGN_TO_TEAM',
  async execute(params, ctx) {
    const teamId = requireString(params, 'teamId');
    const prisma = getPrismaClient();
    if (ctx.entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: ctx.entity.claimId }, data: { assignedTeamId: teamId } });
    } else {
      await prisma.case.update({ where: { id: ctx.entity.caseId }, data: { assignedTeamId: teamId } });
    }
  },
});

/** SET_PRIORITY — params: { priority: string }. */
registerActionHandler({
  actionType: 'SET_PRIORITY',
  async execute(params, ctx) {
    const priority = requireString(params, 'priority');
    const prisma = getPrismaClient();
    if (ctx.entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: ctx.entity.claimId }, data: { priority: priority as never } });
    } else {
      await prisma.case.update({ where: { id: ctx.entity.caseId }, data: { priority: priority as never } });
    }
  },
});

/** ADD_INTERNAL_NOTE — params: { body: string, subject?: string }. Writes an Activity with createdBySystemJob set (no human actor for a background-fired rule). */
registerActionHandler({
  actionType: 'ADD_INTERNAL_NOTE',
  async execute(params, ctx) {
    const body = requireString(params, 'body');
    const subject = typeof params.subject === 'string' && params.subject.length > 0 ? params.subject : 'Automated note';
    const prisma = getPrismaClient();
    await prisma.activity.create({
      data: {
        claimId: ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : undefined,
        caseId: ctx.entity.entityType === 'CASE' ? ctx.entity.caseId : undefined,
        type: 'NOTE',
        direction: 'INTERNAL',
        subject,
        body,
        occurredAt: new Date(),
        createdBySystemJob: ctx.systemJobName ?? 'automation-rule',
      },
    });
  },
});

/** SEND_NOTIFICATION — params: { title: string, body: string, recipientUserId?: string }. */
registerActionHandler({
  actionType: 'SEND_NOTIFICATION',
  async execute(params, ctx) {
    const title = requireString(params, 'title');
    const body = requireString(params, 'body');
    const prisma = getPrismaClient();

    let recipientUserId = typeof params.recipientUserId === 'string' ? params.recipientUserId : undefined;
    if (!recipientUserId) {
      if (ctx.entity.entityType === 'CLAIM') {
        const claim = await prisma.claim.findUnique({ where: { id: ctx.entity.claimId } });
        recipientUserId = claim?.adjusterId ?? undefined;
      } else {
        const kase = await prisma.case.findUnique({ where: { id: ctx.entity.caseId } });
        recipientUserId = kase?.assignedToId ?? undefined;
      }
    }
    if (!recipientUserId) return;

    await prisma.notification.create({
      data: {
        recipientUserId,
        type: 'CASE_MANAGEMENT_AUTOMATION',
        title,
        body,
        relatedEntityType: ctx.entity.entityType,
        relatedEntityId: ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : ctx.entity.caseId,
        channel: 'IN_APP',
        status: 'PENDING',
        dedupeKey: `case-mgmt-automation:${ctx.entity.entityType}:${ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : ctx.entity.caseId}:${randomUUID()}`,
      },
    });
  },
});

export {};
