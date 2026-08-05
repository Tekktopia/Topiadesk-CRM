import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getPrismaClient, getRlsContext, Prisma, type LoyaltyTransaction, type LoyaltyTransactionType } from '@topiadesk/db';

/**
 * A broker redeeming more than this in one transaction needs an ALL-scope
 * caller (department head/compliance/admin) — see postLoyaltyTransaction's
 * scope check below. No org-setting for this yet (LoyaltyAccount/
 * LoyaltyTransaction are new, "clean additive schema" per
 * docs/roadmap-phase2-3.md — a configurable threshold is a reasonable
 * follow-up once there's a real tuning need, not before).
 */
export const LARGE_REDEMPTION_POINTS_THRESHOLD = 10_000;

export interface PostLoyaltyTransactionInput {
  loyaltyAccountId: string;
  type: LoyaltyTransactionType;
  points: number;
  reason: string;
  relatedPolicyId?: string;
  createdById: string;
}

/**
 * The only path that may INSERT a LoyaltyTransaction — see
 * LoyaltyAccount's schema comment for why there is no stored
 * points-balance column at all (the balance is always SUM(points), always
 * computed here inside the same locked transaction that posts the new
 * row, never read-then-trusted from a separate call).
 *
 * Runs its own manually-managed `prisma.$transaction(async (tx) => ...)`
 * (see rls-raw-query.util.ts's header comment on why this bypasses
 * getPrismaClient()'s normal per-call wrapping) so that the row lock,
 * balance check, and insert are one atomic unit — without this, two
 * concurrent REDEEMs against the same account could both read the same
 * starting balance and both succeed, taking the account negative.
 */
export async function postLoyaltyTransaction(input: PostLoyaltyTransactionInput): Promise<LoyaltyTransaction> {
  const ctx = getRlsContext();
  if (!ctx) throw new Error('postLoyaltyTransaction called with no RLS context bound');

  if (input.points === 0) throw new BadRequestException('points must be non-zero');
  if (input.type === 'EARN' && input.points < 0) {
    throw new BadRequestException('EARN transactions must have positive points');
  }
  if ((input.type === 'REDEEM' || input.type === 'EXPIRE') && input.points > 0) {
    throw new BadRequestException(`${input.type} transactions must have negative points`);
  }
  // ADJUST may be either sign — a manual correction can go either
  // direction (fixing an over- or under-grant).

  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.current_user_id', ${ctx.userId}, true),
      set_config('app.current_role', ${ctx.role}, true),
      set_config('app.current_dept_id', ${ctx.departmentId ?? ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId ?? ''}, true),
      set_config('app.current_client_ip', ${ctx.clientIp ?? ''}, true)`;

    // Large redemptions and manual ADJUSTs need department-head-or-above
    // reach, not just "can touch this one account" — mirrors the
    // MANAGER/COMPLIANCE_OFFICER/ADMIN vs. ACCOUNT_HANDLER split everywhere
    // else in this schema (e.g. 'sla_config' write staying admin-only). A
    // broker can EARN/REDEEM normally for their own book; correcting the
    // ledger (ADJUST) is a supervisory action.
    const needsAllScope = input.type === 'ADJUST' || (input.points < 0 && Math.abs(input.points) > LARGE_REDEMPTION_POINTS_THRESHOLD);
    if (needsAllScope) {
      const [{ scope }] = await tx.$queryRaw<[{ scope: string | null }]>(
        Prisma.sql`SELECT app_max_scope('loyalty', 'write') AS scope`,
      );
      if (scope !== 'ALL') {
        throw new ForbiddenException(
          input.type === 'ADJUST'
            ? 'Manual ledger corrections require a department head or above'
            : `Redemptions over ${LARGE_REDEMPTION_POINTS_THRESHOLD} points require a department head or above — ask your manager to post this one`,
        );
      }
    }

    // Row lock on the account, not the ledger — this is what actually
    // serializes concurrent posts against the same account; a second
    // concurrent call blocks here until this transaction commits or rolls
    // back, so its own balance read below is guaranteed fresh.
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM loyalty_accounts WHERE id = ${input.loyaltyAccountId}::uuid FOR UPDATE`,
    );
    if (locked.length === 0) throw new NotFoundException('Loyalty account not found');

    const [{ balance }] = await tx.$queryRaw<[{ balance: bigint | null }]>(
      Prisma.sql`SELECT COALESCE(SUM(points), 0) AS balance FROM loyalty_transactions WHERE loyalty_account_id = ${input.loyaltyAccountId}::uuid`,
    );
    const currentBalance = Number(balance ?? 0);
    const newBalance = currentBalance + input.points;
    if (newBalance < 0) {
      throw new BadRequestException(`Insufficient points: balance is ${currentBalance}, cannot post ${input.points}`);
    }

    return tx.loyaltyTransaction.create({
      data: {
        loyaltyAccountId: input.loyaltyAccountId,
        type: input.type,
        points: input.points,
        reason: input.reason,
        relatedPolicyId: input.relatedPolicyId,
        createdById: input.createdById,
      },
    });
  });
}
