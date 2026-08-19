/**
 * Actions that work on ANY entity type, not just tickets.
 *
 * The handlers in ./handlers.ts are all ticket operations — set status,
 * set priority, assign, note. That is a helpdesk's repertoire. A brokerage
 * running automation over policies, opportunities and clients needs to
 * update a field, raise a follow-up, and tell another system something
 * happened, on records that have no status or assignee in the ticket sense.
 *
 * Kept in a separate file from ./handlers.ts because the split is real:
 * everything there narrows to a Case or a Claim via `requireTicketRef`,
 * everything here goes through the shared entity registry and works the same
 * way on all eight types. Both register into the same registry, so execution
 * and logging are unchanged.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { getPrismaClient } from '@topiadesk/db';
import { getEntityMeta, renderTemplate, type AutomationEntityType } from '@topiadesk/automation';
import { registerActionHandler, type AutomationActionContext } from './action-handler';
import { assertPublicHttpsUrl, isRedirect } from './ssrf-guard';
import { sendMail } from '../jobs/scheduled-reports/mailer';

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`action param "${key}" must be a non-empty string`);
  }
  return value;
}

/**
 * The row the rule matched, for template rendering and field updates.
 *
 * Callers pass it on the context (they have just loaded it to evaluate
 * conditions); this re-reads only if they could not. Rendering from the
 * matched snapshot rather than a fresh read is deliberate — see
 * AutomationActionContext.targetData.
 */
async function loadTarget(ctx: AutomationActionContext): Promise<Record<string, unknown>> {
  if (ctx.targetData) return ctx.targetData;
  const meta = getEntityMeta(ctx.target.entityType);
  if (!meta) throw new Error(`Unknown entity type ${ctx.target.entityType}`);
  const prisma = getPrismaClient();
  const delegate = prisma[meta.model] as unknown as { findUnique(args: unknown): Promise<Record<string, unknown> | null> };
  const row = await delegate.findUnique({ where: { id: ctx.target.id } });
  if (!row) throw new Error(`${meta.label} ${ctx.target.id} no longer exists`);
  return row;
}

/**
 * Finds a human email address for the record the rule fired on.
 *
 * Each entity type reaches a person differently — a lead carries its own
 * address, a policy goes through its client's primary contact — which the
 * registry's `emailSource` encodes so this does not become a switch that
 * silently returns null for types nobody remembered to add.
 *
 * Anonymised contacts are excluded at the query level: a contact erased under
 * a data-subject request must not be emailed by a rule that predates the
 * erasure.
 */
async function resolveEntityEmail(entityType: AutomationEntityType, row: Record<string, unknown>): Promise<string | null> {
  const meta = getEntityMeta(entityType);
  if (!meta) return null;
  const prisma = getPrismaClient();

  if (meta.emailSource === 'self') {
    const email = row.email;
    return typeof email === 'string' && email.length > 0 ? email : null;
  }

  if (meta.emailSource === 'contact') {
    // A case names its contact directly; everything else goes via the client.
    const contactId = row.contactId;
    if (typeof contactId === 'string') {
      const contact = await prisma.contact.findFirst({ where: { id: contactId, anonymizedAt: null }, select: { email: true } });
      if (contact?.email) return contact.email;
    }
  }

  // Claims carry neither an account nor a contact FK, so the only route to a
  // human is through the policy they were made against. Preserves the
  // resolution the ticket-scoped handler did before this was generalised.
  if (meta.emailSource === 'policy') {
    const policyId = row.policyId;
    if (typeof policyId === 'string') {
      const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { accountId: true } });
      if (policy?.accountId) {
        const contact = await prisma.contact.findFirst({
          where: { accountId: policy.accountId, anonymizedAt: null, email: { not: null } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { email: true },
        });
        if (contact?.email) return contact.email;
      }
    }
    return null;
  }

  // On an Account the client id is the row's OWN id — it has no `accountId`
  // column pointing at itself. Reading `row.accountId` here returned
  // undefined for every client, so a rule emailing clients directly resolved
  // nobody while looking like it worked.
  const accountId = entityType === 'ACCOUNT' ? row.id : row.accountId;
  if (typeof accountId === 'string') {
    const contact = await prisma.contact.findFirst({
      where: { accountId, anonymizedAt: null, email: { not: null } },
      // Primary contact first — that is the person the firm actually
      // corresponds with, and ordering by anything else makes which of five
      // contacts receives the mail an accident of insert order.
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { email: true },
    });
    if (contact?.email) return contact.email;
  }

  return null;
}

/**
 * CREATE_TASK — raise a follow-up against the record.
 *
 * The single most requested thing automation could not do: every time-based
 * rule a broker described ("chase the client a week before renewal", "nudge
 * the producer if a quote goes cold") ends in somebody having a task.
 *
 * Attaches to the triggering record via the registry's `taskLinkField`, so
 * the task appears on that policy/opportunity/client rather than floating
 * unattached in a task list.
 */
registerActionHandler({
  actionType: 'CREATE_TASK',
  async execute(params, ctx) {
    const row = await loadTarget(ctx);
    const meta = getEntityMeta(ctx.target.entityType);
    if (!meta) throw new Error(`Unknown entity type ${ctx.target.entityType}`);
    const prisma = getPrismaClient();

    const explicitAssignee = typeof params.assigneeId === 'string' && params.assigneeId.length > 0 ? params.assigneeId : null;
    const ownerFromRecord = meta.ownerField && typeof row[meta.ownerField] === 'string' ? (row[meta.ownerField] as string) : null;
    const assigneeId = explicitAssignee ?? ownerFromRecord;
    // Task.assigneeId is non-nullable — a task nobody owns is a task nobody
    // does, so this fails loudly rather than inventing an assignee.
    if (!assigneeId) {
      throw new Error(`No assignee: this ${meta.label.toLowerCase()} has no owner, so choose who the task should go to.`);
    }

    const dueInDays = typeof params.dueInDays === 'number' ? params.dueInDays : Number(params.dueInDays);
    const dueDate = Number.isFinite(dueInDays) ? new Date(Date.now() + dueInDays * 86_400_000) : null;

    await prisma.task.create({
      data: {
        title: renderTemplate(requireString(params, 'title'), row).slice(0, 500),
        description: typeof params.description === 'string' ? renderTemplate(params.description, row) : null,
        assigneeId,
        priority: (typeof params.priority === 'string' ? params.priority : 'MEDIUM') as never,
        status: 'OPEN' as never,
        dueDate,
        ...(meta.taskLinkField ? { [meta.taskLinkField]: ctx.target.id } : {}),
      },
    });
  },
});

/**
 * UPDATE_FIELD — set any allowlisted field on the record.
 *
 * The general-purpose action, so that "can automation set the risk rating /
 * the stage / the KYC status?" stops needing a new handler each time. The
 * field must exist in the registry for this entity type: that allowlist is
 * what keeps this from being an arbitrary-write primitive, and it also means
 * a typo'd field name is rejected rather than silently doing nothing.
 */
registerActionHandler({
  actionType: 'UPDATE_FIELD',
  async execute(params, ctx) {
    const meta = getEntityMeta(ctx.target.entityType);
    if (!meta) throw new Error(`Unknown entity type ${ctx.target.entityType}`);
    const field = requireString(params, 'field');
    const fieldMeta = meta.fields.find((f) => f.name === field);
    if (!fieldMeta) throw new Error(`${meta.label} has no field called "${field}" that automation may set.`);

    const raw = params.value;
    let value: unknown;
    if (raw === '' || raw === null || raw === undefined) {
      value = null;
    } else if (fieldMeta.kind === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`"${String(raw)}" is not a number.`);
      value = n;
    } else if (fieldMeta.kind === 'boolean') {
      value = raw === true || raw === 'true';
    } else if (fieldMeta.kind === 'date') {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) throw new Error(`"${String(raw)}" is not a date.`);
      value = d;
    } else if (fieldMeta.kind === 'enum') {
      const candidate = String(raw);
      if (fieldMeta.enumValues && !fieldMeta.enumValues.includes(candidate)) {
        throw new Error(`"${candidate}" is not a valid ${fieldMeta.label.toLowerCase()}.`);
      }
      value = candidate;
    } else {
      value = String(raw);
    }

    const prisma = getPrismaClient();
    const delegate = prisma[meta.model] as unknown as { update(args: unknown): Promise<unknown> };
    await delegate.update({ where: { id: ctx.target.id }, data: { [field]: value } });
  },
});

/**
 * CALL_WEBHOOK — POST the record to another system.
 *
 * The escape hatch. Without it, every integration a firm wants is a change
 * request; with it, an admin can wire automation to whatever they already run.
 *
 * Signed with an HMAC when a secret is configured, so the receiver can tell a
 * genuine call from anyone who learned the URL. https is enforced at save
 * time (see validateActions) — this posts client data outbound and must not
 * travel in clear text. The timeout is not optional: an unbounded fetch here
 * would let one unresponsive endpoint stall a scheduled run partway through
 * a batch, leaving half the matched records processed.
 */
registerActionHandler({
  actionType: 'CALL_WEBHOOK',
  async execute(params, ctx) {
    const url = requireString(params, 'url');
    // Rejects https URLs whose host resolves to an internal/link-local/
    // metadata address — the SSRF guard (pentest PT-M1). Was a bare
    // startsWith('https://'), which stopped nothing but plain http.
    await assertPublicHttpsUrl(url);
    const row = await loadTarget(ctx);

    const payload = JSON.stringify({
      entityType: ctx.target.entityType,
      entityId: ctx.target.id,
      firedAt: new Date().toISOString(),
      rule: ctx.systemJobName,
      record: row,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = typeof params.secret === 'string' ? params.secret : '';
    if (secret) {
      headers['X-TopiaDesk-Signature'] = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      // manual: a public URL must not be allowed to 30x onward to an internal
      // one AFTER the guard has cleared it. A redirect is treated as failure.
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (isRedirect(res.status)) {
      throw new Error(`Webhook URL returned a redirect (${res.status}); redirects are not followed.`);
    }
    if (!res.ok) {
      throw new Error(`Webhook POST failed: ${res.status} ${await res.text().catch(() => res.statusText)}`);
    }
  },
});

/**
 * Recipient resolution for SEND_EMAIL, shared with the ticket-scoped handler
 * in ./handlers.ts so both agree on who "the customer" is.
 */
export async function resolveEmailRecipients(
  params: Record<string, unknown>,
  ctx: AutomationActionContext,
  row: Record<string, unknown>,
): Promise<{ addresses: string[]; userIds: string[] }> {
  const mode = typeof params.recipientMode === 'string' ? params.recipientMode : 'CASE_CUSTOMER';
  const prisma = getPrismaClient();

  if (mode === 'ADDRESS') {
    return { addresses: [requireString(params, 'toAddress')], userIds: [] };
  }
  if (mode === 'USER') {
    return { addresses: [], userIds: [requireString(params, 'recipientUserId')] };
  }
  if (mode === 'TEAM') {
    const members = await prisma.teamMember.findMany({
      where: { teamId: requireString(params, 'recipientTeamId') },
      select: { userId: true },
    });
    return { addresses: [], userIds: members.map((m) => m.userId) };
  }

  const email = await resolveEntityEmail(ctx.target.entityType, row);
  // A hard failure, not a silent skip: the rule's author asked for the client
  // to be emailed, and doing nothing quietly is indistinguishable from
  // success in the execution log.
  if (!email) throw new Error(`No email address on file for this ${ctx.target.entityType.toLowerCase()}.`);
  return { addresses: [email], userIds: [] };
}

export { loadTarget, resolveEntityEmail, requireString as requireActionString };

/** Re-exported for the notification rows SEND_EMAIL creates for internal recipients. */
export function notificationDedupeKey(entityType: string, entityId: string, userId: string): string {
  return `automation-email:${entityType}:${entityId}:${userId}:${randomUUID()}`;
}

/** Template rendering is shared; re-exported so ./handlers.ts need not import the package directly. */
export { renderTemplate, sendMail };
