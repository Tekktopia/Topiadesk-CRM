/**
 * Entity-agnostic actions for the API-side registry.
 *
 * This registry backs Macro application — a person clicking "apply" on an
 * open record — whereas the worker's copy backs AutomationRule execution.
 * The two must stay in sync on `actionType` keys and params (see
 * action-handler.ts's header), which is why both now register CREATE_TASK
 * and UPDATE_FIELD from a shared catalog.
 *
 * SEND_EMAIL, CALL_WEBHOOK and NOTIFY_TEAMS_CHANNEL are registered at the
 * bottom of this file as ENQUEUE-ONLY handlers. All three reach outside the
 * system and can block for seconds, and a macro is applied inside a user's
 * HTTP request — so this side hands them to the worker rather than
 * performing them inline. See async-action-queue.ts.
 */

import { getPrismaClient } from '@topiadesk/db';
import { getEntityMeta, renderTemplate } from '@topiadesk/automation';
import { registerActionHandler, type AutomationActionContext } from './action-handler';
import { enqueueAsyncAction } from './async-action-queue';

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`action param "${key}" must be a non-empty string`);
  }
  return value;
}

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

/** CREATE_TASK — raise a follow-up attached to the record. Mirrors the worker's handler exactly. */
registerActionHandler({
  actionType: 'CREATE_TASK',
  async execute(params, ctx) {
    const row = await loadTarget(ctx);
    const meta = getEntityMeta(ctx.target.entityType);
    if (!meta) throw new Error(`Unknown entity type ${ctx.target.entityType}`);
    const prisma = getPrismaClient();

    const explicitAssignee = typeof params.assigneeId === 'string' && params.assigneeId.length > 0 ? params.assigneeId : null;
    const ownerFromRecord = meta.ownerField && typeof row[meta.ownerField] === 'string' ? (row[meta.ownerField] as string) : null;
    // Falls back to the person applying the macro — unlike the worker, this
    // path always has a real user, so an unowned record still produces a task
    // with an owner rather than failing.
    const assigneeId = explicitAssignee ?? ownerFromRecord ?? ctx.actingUserId;
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

/** UPDATE_FIELD — set any registry-allowlisted field. Mirrors the worker's handler exactly. */
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
 * The three actions this side deliberately does not perform itself.
 *
 * SEND_EMAIL, CALL_WEBHOOK and NOTIFY_TEAMS_CHANNEL all wait on a third
 * party. A macro runs inside a user's HTTP request, so performing them here
 * would hang that request on someone else's server — and an agent watching
 * a spinner cannot tell a slow SMTP handshake from a broken macro.
 *
 * Registering them as enqueue-only closes a real gap rather than papering
 * over one: before this, a macro containing any of the three failed outright
 * with "Unknown actionType", because only the worker's registry implemented
 * them. Now the macro succeeds and the action is carried out moments later
 * by the worker, which logs it to AutomationExecutionLog like any other
 * firing.
 */
for (const actionType of ['SEND_EMAIL', 'CALL_WEBHOOK', 'NOTIFY_TEAMS_CHANNEL'] as const) {
  registerActionHandler({
    actionType,
    async execute(params, ctx) {
      await enqueueAsyncAction({
        actionType,
        params,
        entityType: ctx.target.entityType,
        entityId: ctx.target.id,
        actingUserId: ctx.actingUserId,
      });
    },
  });
}
