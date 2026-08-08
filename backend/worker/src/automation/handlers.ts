import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@topiadesk/db';
import { registerActionHandler } from './action-handler';
import { isValidCaseTransition, isValidClaimTransition } from './lifecycle-transitions';
import { sendMail } from '../jobs/scheduled-reports/mailer';

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

/**
 * SEND_NOTIFICATION — params: { title: string, body: string, recipientUserId?: string, recipientTeamId?: string, channel?: 'IN_APP' | 'EMAIL' }.
 * `recipientTeamId` fans out one Notification per current TeamMember of
 * that team (the workflow builder's "Notify a group" step) — takes
 * priority over `recipientUserId` if both are somehow set. Safe to create
 * Notification rows for arbitrary other users here: this handler only ever
 * runs inside processEntityEvent's runWithRlsContext(SYSTEM_JOB_CONTEXT,
 * ...) wrapper (automation-events.queue.ts), which bypasses
 * notifications_rw's `recipient_user_id = app_current_user_id()` WITH
 * CHECK the same way enqueueSurveyInvitesForResolvedCase/request-closure do.
 * Keep in sync with the identical handler in
 * backend/api/src/modules/case-management/automation/handlers.ts (see that
 * file's comment on `channel` — EMAIL rows are picked up by
 * notification-dispatch/notification-email-dispatch.job.ts, not sent here).
 */
registerActionHandler({
  actionType: 'SEND_NOTIFICATION',
  async execute(params, ctx) {
    const title = requireString(params, 'title');
    const body = requireString(params, 'body');
    const channel = params.channel === 'EMAIL' ? 'EMAIL' : 'IN_APP';
    const prisma = getPrismaClient();
    const relatedEntityType = ctx.entity.entityType;
    const relatedEntityId = ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : ctx.entity.caseId;

    const recipientTeamId = typeof params.recipientTeamId === 'string' ? params.recipientTeamId : undefined;
    let recipientUserIds: string[];
    if (recipientTeamId) {
      const members = await prisma.teamMember.findMany({ where: { teamId: recipientTeamId }, select: { userId: true } });
      recipientUserIds = members.map((m) => m.userId);
    } else {
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
      recipientUserIds = recipientUserId ? [recipientUserId] : [];
    }
    if (recipientUserIds.length === 0) return;

    await prisma.notification.createMany({
      data: recipientUserIds.map((recipientUserId) => ({
        recipientUserId,
        type: 'CASE_MANAGEMENT_AUTOMATION',
        title,
        body,
        relatedEntityType,
        relatedEntityId,
        channel,
        status: 'PENDING',
        dedupeKey: `case-mgmt-automation:${relatedEntityType}:${relatedEntityId}:${recipientUserId}:${randomUUID()}`,
      })),
    });
  },
});

/** Mirrors send-case-survey-invite.job.ts's exact contact-resolution chain
 * (Case's own linked Contact first, else its Account's primary Contact) —
 * deliberately duplicated rather than imported, same api/worker deployable
 * boundary every other worker job in this directory respects. Claims have
 * no direct Contact FK, so they resolve via their Policy's Account's
 * primary Contact instead. */
async function resolveCaseManagementCustomerEmail(entity: { entityType: 'CASE' | 'CLAIM'; caseId?: string; claimId?: string }): Promise<string | null> {
  const prisma = getPrismaClient();
  if (entity.entityType === 'CLAIM') {
    const claim = await prisma.claim.findUnique({
      where: { id: entity.claimId! },
      include: { policy: { include: { account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } } } },
    });
    return claim?.policy.account.contacts[0]?.email ?? null;
  }
  const kase = await prisma.case.findUnique({
    where: { id: entity.caseId! },
    include: { contact: true, account: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } },
  });
  return kase?.contact?.email ?? kase?.account?.contacts[0]?.email ?? null;
}

/**
 * SEND_EMAIL — params: { recipientMode: 'USER'|'TEAM'|'CASE_CUSTOMER',
 * recipientUserId?, recipientTeamId?, subject: string, body: string }. A
 * first-class "send an email" workflow action, distinct from
 * SEND_NOTIFICATION's EMAIL channel (which is internal-staff-only and
 * always tied to a Notification row). USER/TEAM modes still go through
 * the Notification/channel:'EMAIL' path (reuses the existing, already-
 * proven async dispatcher in notification-email-dispatch.job.ts, no new
 * send code for those two). CASE_CUSTOMER has no internal User to attach a
 * Notification to, so it sends synchronously via the existing sendMail()
 * — this handler already only ever runs inside a background worker job
 * (processEntityEvent), never a synchronous user-facing request, so a
 * transient SMTP failure just fails this action/run the same way any
 * other action failure does today (visible in AutomationRunState.
 * failureReason). No email on file is also a hard failure, not a silent
 * skip — the workflow author asked for a customer to be emailed, and
 * silently doing nothing would look indistinguishable from success.
 */
registerActionHandler({
  actionType: 'SEND_EMAIL',
  async execute(params, ctx) {
    const recipientMode = params.recipientMode === 'TEAM' || params.recipientMode === 'CASE_CUSTOMER' ? params.recipientMode : 'USER';
    const subject = requireString(params, 'subject');
    const body = requireString(params, 'body');
    const prisma = getPrismaClient();

    if (recipientMode === 'CASE_CUSTOMER') {
      const email = await resolveCaseManagementCustomerEmail(
        ctx.entity.entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: ctx.entity.claimId } : { entityType: 'CASE', caseId: ctx.entity.caseId },
      );
      if (!email) throw new Error('No email on file for this ticket/claim’s customer');
      await sendMail({ to: email, subject, text: body });
      return;
    }

    const relatedEntityType = ctx.entity.entityType;
    const relatedEntityId = ctx.entity.entityType === 'CLAIM' ? ctx.entity.claimId : ctx.entity.caseId;
    const recipientUserIds =
      recipientMode === 'TEAM'
        ? (await prisma.teamMember.findMany({ where: { teamId: requireString(params, 'recipientTeamId') }, select: { userId: true } })).map((m) => m.userId)
        : [requireString(params, 'recipientUserId')];
    if (recipientUserIds.length === 0) return;

    await prisma.notification.createMany({
      data: recipientUserIds.map((recipientUserId) => ({
        recipientUserId,
        type: 'CASE_MANAGEMENT_AUTOMATION',
        title: subject,
        body,
        relatedEntityType,
        relatedEntityId,
        channel: 'EMAIL',
        status: 'PENDING',
        dedupeKey: `case-mgmt-automation-email:${relatedEntityType}:${relatedEntityId}:${recipientUserId}:${randomUUID()}`,
      })),
    });
  },
});

/**
 * NOTIFY_TEAMS_CHANNEL — params: { connectorId: string, title: string, body: string }.
 * Posts a MessageCard-shaped payload to a TEAMS_WEBHOOK IntegrationConnector's
 * config.webhookUrl (a Teams "Incoming Webhook" URL — no OAuth, no Azure app
 * registration needed, generated from inside Teams itself). Sibling to
 * SEND_EMAIL above: a direct synchronous fetch() rather than a queued
 * Notification row, since this is a channel post (not per-recipient-user),
 * matching backend/worker/src/jobs/webhooks/dispatch.job.ts's own use of
 * plain fetch() for outbound calls (no new HTTP client dependency). A
 * failed post fails just this action/run with a clear reason, same as
 * every other action handler — the automation run itself is the
 * retry/visibility boundary, no bespoke retry system needed here.
 */
registerActionHandler({
  actionType: 'NOTIFY_TEAMS_CHANNEL',
  async execute(params) {
    const connectorId = requireString(params, 'connectorId');
    const title = requireString(params, 'title');
    const body = requireString(params, 'body');
    const prisma = getPrismaClient();

    const connector = await prisma.integrationConnector.findUnique({ where: { id: connectorId } });
    if (!connector) throw new Error(`Integration connector ${connectorId} not found`);
    if (connector.connectorType !== 'TEAMS_WEBHOOK') throw new Error(`Connector "${connector.name}" is not a TEAMS_WEBHOOK connector`);
    if (!connector.isEnabled) throw new Error(`Connector "${connector.name}" is disabled`);

    const config = connector.config as { webhookUrl?: string } | null;
    if (!config?.webhookUrl) throw new Error(`Connector "${connector.name}" has no webhookUrl configured`);

    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: title,
        title,
        text: body,
      }),
    });
    if (!res.ok) {
      throw new Error(`Teams webhook POST failed: ${res.status} ${await res.text().catch(() => res.statusText)}`);
    }
  },
});

export {};
