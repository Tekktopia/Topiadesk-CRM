import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { KeycloakWebhookGuard } from './keycloak-webhook.guard';
// Neither DTO here is type-only: KeycloakWebhookEventDto is a @Body()
// parameter type (NestJS's ValidationPipe needs the real class reference at
// runtime — see ai-gateway.controller.ts's comment on this footgun), and
// KeycloakWebhookResponseDto is passed to @ApiOkResponse({ type: ... }),
// which equally needs the real class reference for Swagger reflection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- see comment above
import { KeycloakWebhookEventDto, KeycloakWebhookEventType, KeycloakWebhookResponseDto } from './dto/keycloak-webhook.dto';

/**
 * Foundation piece for Phase 2: receives Keycloak user-lifecycle events and
 * keeps the local `users` table in sync (create/update, keyed by
 * keycloak_subject_id). Payload contract: dto/keycloak-webhook.dto.ts. Not
 * wired to a live Keycloak realm subscription — that's explicitly out of
 * scope here (see the Batch 1 plan); this is the receiving side only.
 *
 * This route is excluded from RlsContextMiddleware in app.module.ts (fixed
 * during the Batch 1 integration pass) — Keycloak has no TopiaDesk-issued
 * JWT to present, so it's secured independently by KeycloakWebhookGuard's
 * shared-secret check instead. That exclusion means no RLS context gets
 * bound for this request the normal way, which surfaced a second bug at
 * integration time: `users` has an audit trigger that inserts into
 * `audit_log`, and audit_log's own RLS INSERT policy requires
 * app_current_user_id() or app_current_role()='SYSTEM_JOB' to be set —
 * with no context bound at all, that insert was rejected outright
 * (`new row violates row-level security policy for table "audit_log"`).
 * Fixed by explicitly running the handler under SYSTEM_JOB_CONTEXT, the
 * same principal apps/worker's background jobs use.
 */
@ApiTags('identity')
@ApiHeader({ name: 'x-keycloak-webhook-secret', required: true, description: 'Shared secret — see KEYCLOAK_WEBHOOK_SECRET' })
@UseGuards(KeycloakWebhookGuard)
@Controller('identity/webhooks/keycloak')
export class KeycloakWebhookController {
  @Post()
  @ApiOkResponse({ type: KeycloakWebhookResponseDto })
  handleEvent(@Body() dto: KeycloakWebhookEventDto): Promise<KeycloakWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(dto));
  }

  private async process(dto: KeycloakWebhookEventDto): Promise<KeycloakWebhookResponseDto> {
    const prisma = getPrismaClient();

    if (dto.eventType === KeycloakWebhookEventType.USER_DELETED || dto.eventType === KeycloakWebhookEventType.USER_DISABLED) {
      const existing = await prisma.user.findUnique({ where: { keycloakSubjectId: dto.keycloakSubjectId } });
      if (!existing) return { status: 'ok', action: 'skipped', userId: null };
      // Deactivate rather than delete: Users are referenced widely (Account
      // owners, Policy broker-of-record, ...) — a hard delete would either
      // cascade destructively or fail on FK constraints. DEACTIVATED is the
      // correct "this identity should no longer act" signal.
      await prisma.user.update({ where: { id: existing.id }, data: { status: 'DEACTIVATED', lastSyncedAt: new Date() } });
      return { status: 'ok', action: 'deactivated', userId: existing.id };
    }

    if (!dto.email) {
      throw new BadRequestException('email is required for USER_CREATED/USER_UPDATED/USER_ENABLED events');
    }

    const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || dto.email;
    const status = dto.enabled === false ? 'DEACTIVATED' : 'ACTIVE';

    let departmentId: string | undefined;
    let branchId: string | undefined;
    if (dto.attributes?.departmentCode) {
      const dept = await prisma.department.findUnique({ where: { code: dto.attributes.departmentCode } });
      departmentId = dept?.id;
    }
    if (dto.attributes?.branchCode) {
      const branch = await prisma.branch.findUnique({ where: { code: dto.attributes.branchCode } });
      branchId = branch?.id;
    }

    const existing = await prisma.user.findUnique({ where: { keycloakSubjectId: dto.keycloakSubjectId } });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: dto.email,
          fullName,
          status,
          ...(departmentId !== undefined && { departmentId }),
          ...(branchId !== undefined && { branchId }),
          lastSyncedAt: new Date(),
        },
      });
      return { status: 'ok', action: 'updated', userId: updated.id };
    }

    const created = await prisma.user.create({
      data: {
        keycloakSubjectId: dto.keycloakSubjectId,
        email: dto.email,
        fullName,
        status,
        departmentId,
        branchId,
        lastSyncedAt: new Date(),
      },
    });
    return { status: 'ok', action: 'created', userId: created.id };
  }
}
