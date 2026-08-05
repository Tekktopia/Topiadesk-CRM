import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { runWithRlsContext, SYSTEM_JOB_CONTEXT } from '@topiadesk/db';
import { KeycloakWebhookGuard } from './keycloak-webhook.guard';
// NOT a type-only import: UserProvisioningService is constructor-injected
// below — see the same footgun documented on Reflector in permission.guard.ts.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UserProvisioningService } from './user-provisioning.service';
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
 *
 * The actual create/update/deactivate-by-keycloakSubjectId logic now lives
 * in UserProvisioningService (extracted so the new SCIM controller —
 * scim.controller.ts — can reuse the exact same local-row upsert semantics
 * instead of a second hand-rolled copy).
 */
@ApiTags('identity')
@ApiHeader({ name: 'x-keycloak-webhook-secret', required: true, description: 'Shared secret — see KEYCLOAK_WEBHOOK_SECRET' })
@UseGuards(KeycloakWebhookGuard)
@Controller('identity/webhooks/keycloak')
export class KeycloakWebhookController {
  constructor(private readonly provisioning: UserProvisioningService) {}

  @Post()
  @ApiOkResponse({ type: KeycloakWebhookResponseDto })
  handleEvent(@Body() dto: KeycloakWebhookEventDto): Promise<KeycloakWebhookResponseDto> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, () => this.process(dto));
  }

  private async process(dto: KeycloakWebhookEventDto): Promise<KeycloakWebhookResponseDto> {
    if (dto.eventType === KeycloakWebhookEventType.USER_DELETED || dto.eventType === KeycloakWebhookEventType.USER_DISABLED) {
      const result = await this.provisioning.deactivateByKeycloakSubjectId(dto.keycloakSubjectId);
      return { status: 'ok', action: result.action, userId: result.userId };
    }

    if (!dto.email) {
      throw new BadRequestException('email is required for USER_CREATED/USER_UPDATED/USER_ENABLED events');
    }

    const result = await this.provisioning.upsertLocalUser({
      keycloakSubjectId: dto.keycloakSubjectId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      enabled: dto.enabled,
      departmentCode: dto.attributes?.departmentCode,
      branchCode: dto.attributes?.branchCode,
    });
    return { status: 'ok', action: result.action, userId: result.userId };
  }
}
