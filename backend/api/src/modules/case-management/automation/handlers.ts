import { randomUUID } from 'node:crypto';
import { getPrismaClient, runWithRlsContext, SYSTEM_JOB_CONTEXT, type CasePriority, type CaseStatus, type ClaimStatus } from '@topiadesk/db';
import { registerActionHandler, requireTicketRef } from './action-handler';
import { applyCaseStatusTransition, applyClaimStatusTransition } from '../status-transition.util';
// Registers CREATE_TASK / UPDATE_FIELD as a side effect of the import, so a
// macro gets them too — importing this module has always been what populates
// the registry.
import './generic-handlers';

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`action param "${key}" must be a non-empty string`);
  }
  return value;
}

/** SET_STATUS — params: { status: string }. Routes to the same validated-transition + ClaimStatusHistory/SlaClock-bookkeeping path a direct status-change API call uses. */
registerActionHandler({
  actionType: 'SET_STATUS',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const status = requireString(params, 'status');
    if (entity.entityType === 'CLAIM') {
      await applyClaimStatusTransition(entity.claimId, status as ClaimStatus, ctx.actingUserId, 'Applied via macro/automation');
    } else {
      await applyCaseStatusTransition(entity.caseId, status as CaseStatus, 'Applied via macro/automation');
    }
  },
});

/** ASSIGN_TO_USER — params: { userId: string }. Claim.adjusterId / Case.assignedToId. */
registerActionHandler({
  actionType: 'ASSIGN_TO_USER',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const userId = requireString(params, 'userId');
    const prisma = getPrismaClient();
    if (entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: entity.claimId }, data: { adjusterId: userId } });
    } else {
      await prisma.case.update({ where: { id: entity.caseId }, data: { assignedToId: userId } });
    }
  },
});

/** ASSIGN_TO_TEAM — params: { teamId: string }. Both Claim and Case carry assignedTeamId directly. */
registerActionHandler({
  actionType: 'ASSIGN_TO_TEAM',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const teamId = requireString(params, 'teamId');
    const prisma = getPrismaClient();
    if (entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: entity.claimId }, data: { assignedTeamId: teamId } });
    } else {
      await prisma.case.update({ where: { id: entity.caseId }, data: { assignedTeamId: teamId } });
    }
  },
});

/** SET_PRIORITY — params: { priority: string }. CasePriority is shared by both Claim.priority and Case.priority. */
registerActionHandler({
  actionType: 'SET_PRIORITY',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const priority = requireString(params, 'priority') as CasePriority;
    const prisma = getPrismaClient();
    if (entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: entity.claimId }, data: { priority } });
    } else {
      await prisma.case.update({ where: { id: entity.caseId }, data: { priority } });
    }
  },
});

/** ADD_INTERNAL_NOTE — params: { body: string, subject?: string }. Writes an Activity (direction: INTERNAL, type: NOTE) — comment threading reuses Activity, never a new table. */
registerActionHandler({
  actionType: 'ADD_INTERNAL_NOTE',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const body = requireString(params, 'body');
    const subject = typeof params.subject === 'string' && params.subject.length > 0 ? params.subject : 'Automated note';
    const prisma = getPrismaClient();
    await prisma.activity.create({
      data: {
        claimId: entity.entityType === 'CLAIM' ? entity.claimId : undefined,
        caseId: entity.entityType === 'CASE' ? entity.caseId : undefined,
        type: 'NOTE',
        direction: 'INTERNAL',
        subject,
        body,
        occurredAt: new Date(),
        createdById: ctx.actingUserId ?? undefined,
        createdBySystemJob: ctx.actingUserId ? undefined : (ctx.systemJobName ?? 'automation-rule'),
      },
    });
  },
});

/**
 * SEND_NOTIFICATION — params: { title: string, body: string, recipientUserId?: string, recipientTeamId?: string, channel?: 'IN_APP' | 'EMAIL' }.
 * Defaults the recipient to the entity's current assignee when neither
 * `recipientUserId` nor `recipientTeamId` is given, and the channel to
 * 'IN_APP' (backward compatible — every rule authored before `channel`
 * existed keeps behaving identically). `recipientTeamId` fans out one
 * Notification per current TeamMember of that team (the workflow builder's
 * "Notify a group" step) and takes priority if both are somehow set.
 * `channel: 'EMAIL'` rows are picked up by
 * backend/worker/src/jobs/notification-dispatch/notification-email-dispatch.job.ts,
 * not sent from here directly (see that file's header comment for why —
 * sending inline here would risk this request/transaction on an SMTP
 * hiccup).
 *
 * Unlike every other handler in this file, this one's write must run under
 * SYSTEM_JOB_CONTEXT: macros.service.ts calls executeActions under the
 * ACTING USER's own interactive RLS context (no SYSTEM_JOB wrap at that
 * call site, unlike the worker's processEntityEvent — see the identical
 * handler in backend/worker/src/automation/handlers.ts), so a macro that
 * notifies anyone other than the person applying it would otherwise trip
 * notifications_rw's `recipient_user_id = app_current_user_id()` WITH
 * CHECK. Same fix as CasesController.requestClosure's notify-every-
 * compliance-officer loop.
 */
registerActionHandler({
  actionType: 'SEND_NOTIFICATION',
  async execute(params, ctx) {
    const entity = requireTicketRef(ctx);
    const title = requireString(params, 'title');
    const body = requireString(params, 'body');
    const channel = params.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP';
    const prisma = getPrismaClient();
    const relatedEntityType = entity.entityType;
    const relatedEntityId = entity.entityType === 'CLAIM' ? entity.claimId : entity.caseId;

    const recipientTeamId = typeof params.recipientTeamId === 'string' ? params.recipientTeamId : undefined;
    let recipientUserIds: string[];
    if (recipientTeamId) {
      const members = await prisma.teamMember.findMany({ where: { teamId: recipientTeamId }, select: { userId: true } });
      recipientUserIds = members.map((m) => m.userId);
    } else {
      let recipientUserId = typeof params.recipientUserId === 'string' ? params.recipientUserId : undefined;
      if (!recipientUserId) {
        if (entity.entityType === 'CLAIM') {
          const claim = await prisma.claim.findUnique({ where: { id: entity.claimId } });
          recipientUserId = claim?.adjusterId ?? undefined;
        } else {
          const kase = await prisma.case.findUnique({ where: { id: entity.caseId } });
          recipientUserId = kase?.assignedToId ?? undefined;
        }
      }
      recipientUserIds = recipientUserId ? [recipientUserId] : [];
    }
    if (recipientUserIds.length === 0) return; // nothing sensible to notify — silently a no-op, not a failure

    await runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      await getPrismaClient().notification.createMany({
        data: recipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          type: 'CASE_MANAGEMENT_AUTOMATION',
          title,
          body,
          relatedEntityType,
          relatedEntityId,
          channel,
          status: 'PENDING',
          // Macro/automation-triggered notifications are one-off events, not
          // a recurring poll like the renewal-alert scan — no natural
          // idempotency key exists to dedupe against, so this generates a
          // fresh one every time (dedupeKey's UNIQUE constraint still
          // applies, it just never collides by construction).
          dedupeKey: `case-mgmt-automation:${relatedEntityType}:${relatedEntityId}:${recipientUserId}:${randomUUID()}`,
        })),
      });
    });
  },
});

export {};
