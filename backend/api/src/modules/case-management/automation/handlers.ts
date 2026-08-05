import { randomUUID } from 'node:crypto';
import { getPrismaClient, type CasePriority, type CaseStatus, type ClaimStatus } from '@topiadesk/db';
import { registerActionHandler } from './action-handler';
import { applyCaseStatusTransition, applyClaimStatusTransition } from '../status-transition.util';

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
    const status = requireString(params, 'status');
    if (ctx.entity.entityType === 'CLAIM') {
      await applyClaimStatusTransition(ctx.entity.claimId, status as ClaimStatus, ctx.actingUserId, 'Applied via macro/automation');
    } else {
      await applyCaseStatusTransition(ctx.entity.caseId, status as CaseStatus, 'Applied via macro/automation');
    }
  },
});

/** ASSIGN_TO_USER — params: { userId: string }. Claim.adjusterId / Case.assignedToId. */
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

/** ASSIGN_TO_TEAM — params: { teamId: string }. Both Claim and Case carry assignedTeamId directly. */
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

/** SET_PRIORITY — params: { priority: string }. CasePriority is shared by both Claim.priority and Case.priority. */
registerActionHandler({
  actionType: 'SET_PRIORITY',
  async execute(params, ctx) {
    const priority = requireString(params, 'priority') as CasePriority;
    const prisma = getPrismaClient();
    if (ctx.entity.entityType === 'CLAIM') {
      await prisma.claim.update({ where: { id: ctx.entity.claimId }, data: { priority } });
    } else {
      await prisma.case.update({ where: { id: ctx.entity.caseId }, data: { priority } });
    }
  },
});

/** ADD_INTERNAL_NOTE — params: { body: string, subject?: string }. Writes an Activity (direction: INTERNAL, type: NOTE) — comment threading reuses Activity, never a new table. */
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
        createdById: ctx.actingUserId ?? undefined,
        createdBySystemJob: ctx.actingUserId ? undefined : (ctx.systemJobName ?? 'automation-rule'),
      },
    });
  },
});

/** SEND_NOTIFICATION — params: { title: string, body: string, recipientUserId?: string }. Defaults the recipient to the entity's current assignee when not given explicitly. */
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
    if (!recipientUserId) return; // nothing sensible to notify — silently a no-op, not a failure

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
        // Macro/automation-triggered notifications are one-off events, not a
        // recurring poll like the renewal-alert scan — no natural
        // idempotency key exists to dedupe against, so this generates a
        // fresh one every time (dedupeKey's UNIQUE constraint still applies,
        // it just never collides by construction).
        dedupeKey: `case-mgmt-automation:${ctx.entity.entityType}:${ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : ctx.entity.caseId}:${randomUUID()}`,
      },
    });
  },
});

export {};
