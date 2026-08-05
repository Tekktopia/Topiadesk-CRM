/**
 * CREATE_TASK — the first real AutomationRule consumer for Renewal
 * Playbooks (CRM enhancements domain). Registered into the SAME shared
 * registry case-management's ./handlers.ts uses (./action-handler.ts) —
 * one Map, one set of concrete actionType implementations, per that file's
 * own header comment — rather than standing up a second registry.
 *
 * Reconciliation note (flagged for whoever wires the two domains together
 * fully): action-handler.ts's `AutomationActionContext.entity` type
 * (`CaseManagementEntityRef`) is a closed union of CLAIM/CASE refs, and
 * `processEntityEvent`/`executeActions` in automation-events.queue.ts only
 * ever construct that union for Claim/Case entity-events — there is no
 * RENEWAL_SCHEDULE member, and adding one there would require touching a
 * file case-management's automation depends on (handlers.ts's SET_STATUS/
 * ASSIGN_TO_USER/etc all pattern-match on exactly two entity variants via
 * plain if/else, so a third variant compiles fine but is silently wrong for
 * any of THEIR handlers if it were ever routed to them — it just never is,
 * since only this module's own hook below ever invokes CREATE_TASK).
 * Given that risk, this handler deliberately never reads `ctx.entity` at
 * all — every renewal-specific reference (policyId/accountId/assigneeId)
 * travels through `params` instead, set by the caller
 * (renewal-scan.job.ts). The renewal-scan hook calls this handler directly
 * via `getActionHandler('CREATE_TASK')`, not through case-management's
 * Claim/Case-only `executeActions`/`processEntityEvent` — those stay
 * untouched. A `ctx` value is still required to satisfy
 * AutomationActionHandler's signature; renewal-scan.job.ts passes one shaped
 * like this handler needs (see RENEWAL_ACTION_CTX there) with a documented
 * type assertion at that one call site, precisely because ctx.entity is
 * unused here.
 */
import { getPrismaClient } from '@topiadesk/db';
import { registerActionHandler } from './action-handler';

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`action param "${key}" must be a non-empty string`);
  }
  return value;
}

registerActionHandler({
  actionType: 'CREATE_TASK',
  async execute(params) {
    const title = requireString(params, 'title');
    const description = typeof params.description === 'string' ? params.description : undefined;
    const dueInDays = typeof params.dueInDays === 'number' ? params.dueInDays : 3;
    const assigneeId = requireString(params, 'assigneeId');
    const accountId = typeof params.accountId === 'string' ? params.accountId : undefined;
    const policyId = typeof params.policyId === 'string' ? params.policyId : undefined;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueInDays);

    const prisma = getPrismaClient();
    await prisma.task.create({
      data: {
        title,
        description,
        dueDate,
        priority: 'MEDIUM',
        status: 'OPEN',
        assigneeId,
        accountId,
        policyId,
      },
    });
  },
});

export {};
