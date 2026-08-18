import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';

/**
 * Sequential top-level calls, not `getPrismaClient().$transaction([...])` —
 * see leads.controller.ts's convert() for the documented, empirically-
 * verified reason that call is broken through the RLS-aware Proxy. Unlike
 * convert() (which creates new rows needing compensation on failure), every
 * reassignment step below is an idempotent updateMany pointing an FK at the
 * winner — re-running a partially-failed merge is safe on retry, so no
 * explicit rollback/compensation is needed here. The loser is only deleted
 * as the LAST step, so a failure partway through just leaves an
 * already-mostly-reassigned loser behind, never a half-deleted record.
 *
 * Every FK actually referencing accounts/contacts/leads was enumerated
 * directly from the live database's information_schema (not just grepped
 * from schema.prisma) before writing this, specifically to catch ON DELETE
 * CASCADE columns outside this module's scope — deleting the loser without
 * handling those would otherwise silently cascade-delete rows in domains
 * this module doesn't own (Claims/Cases, Campaigns) the moment the loser
 * row itself gets deleted. Where that risk exists, the merge is blocked
 * with a clear error instead of either reassigning data in a domain this
 * module doesn't understand well enough to reassign safely, or silently
 * losing it to a cascade.
 */

async function assertNoBlockingReferences(kind: 'account' | 'contact', loserId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (kind === 'account') {
    // cases.account_id is ON DELETE CASCADE (case-management domain, out of
    // this module's scope) — deleting the loser account would silently
    // destroy any Case rows still pointing at it.
    const caseCount = await prisma.case.count({ where: { accountId: loserId } });
    if (caseCount > 0) {
      throw new BadRequestException(
        `Cannot merge: ${caseCount} ticket(s) still reference the loser account. Reassign or resolve them first — case_management.cases.account_id cascades on delete.`,
      );
    }
  } else {
    // campaign_recipients.contact_id is ON DELETE CASCADE (campaigns
    // domain, out of this module's scope) — deleting the loser contact
    // would silently destroy send-history rows still pointing at it.
    const recipientCount = await prisma.campaignRecipient.count({ where: { contactId: loserId } });
    if (recipientCount > 0) {
      throw new BadRequestException(
        `Cannot merge: ${recipientCount} campaign recipient record(s) still reference the loser contact. Resolve them first — campaign_recipients.contact_id cascades on delete.`,
      );
    }
  }
}

export async function mergeAccounts(winnerId: string, loserId: string): Promise<{ winnerId: string; loserId: string }> {
  if (winnerId === loserId) throw new BadRequestException('winnerId and loserId must be different accounts');
  const prisma = getPrismaClient();
  const [winner, loser] = await Promise.all([
    prisma.account.findUnique({ where: { id: winnerId } }),
    prisma.account.findUnique({ where: { id: loserId } }),
  ]);
  if (!winner) throw new NotFoundException('Winner account not found');
  if (!loser) throw new NotFoundException('Loser account not found');

  await assertNoBlockingReferences('account', loserId);

  // In-scope children (accounts_id has ON DELETE CASCADE for all of these —
  // reassigning first means the loser's delete at the end touches none of
  // them).
  await prisma.contact.updateMany({ where: { accountId: loserId }, data: { accountId: winnerId } });
  await prisma.opportunity.updateMany({ where: { accountId: loserId }, data: { accountId: winnerId } });
  await prisma.activity.updateMany({ where: { accountId: loserId }, data: { accountId: winnerId } });
  await prisma.task.updateMany({ where: { accountId: loserId }, data: { accountId: winnerId } });
  // policies.account_id is ON DELETE RESTRICT — reassigning first is not
  // just tidy, it's required, or the delete below fails outright.
  await prisma.policy.updateMany({ where: { accountId: loserId }, data: { accountId: winnerId } });

  // Both default to ON DELETE SET NULL — reassigning instead preserves the
  // hierarchy/conversion link rather than silently losing it.
  await prisma.account.updateMany({ where: { parentAccountId: loserId }, data: { parentAccountId: winnerId } });
  await prisma.lead.updateMany({ where: { convertedAccountId: loserId }, data: { convertedAccountId: winnerId } });

  // Relationships: reassign each side individually, dropping anything that
  // would become a self-relationship (winner<->winner) or collide with the
  // [accountAId, accountBId, relationshipType] unique constraint against a
  // relationship that already exists between winner and the same
  // counterparty.
  const [relsAsA, relsAsB] = await Promise.all([
    prisma.accountRelationship.findMany({ where: { accountAId: loserId } }),
    prisma.accountRelationship.findMany({ where: { accountBId: loserId } }),
  ]);
  for (const rel of relsAsA) {
    if (rel.accountBId === winnerId) {
      await prisma.accountRelationship.delete({ where: { id: rel.id } }).catch(() => undefined);
      continue;
    }
    await prisma.accountRelationship
      .update({ where: { id: rel.id }, data: { accountAId: winnerId } })
      .catch(() => prisma.accountRelationship.delete({ where: { id: rel.id } }).catch(() => undefined));
  }
  for (const rel of relsAsB) {
    if (rel.accountAId === winnerId) {
      await prisma.accountRelationship.delete({ where: { id: rel.id } }).catch(() => undefined);
      continue;
    }
    await prisma.accountRelationship
      .update({ where: { id: rel.id }, data: { accountBId: winnerId } })
      .catch(() => prisma.accountRelationship.delete({ where: { id: rel.id } }).catch(() => undefined));
  }

  // Soft-archive, not a hard delete — matches Document.isArchived's
  // pattern and accounts.controller.ts's remove()/bulkDelete(). The loser
  // is fully reassigned by this point (nothing meaningful left pointing at
  // it besides its own row), so archiving is enough; deleting it outright
  // would also throw away its audit history for no benefit.
  await prisma.account.update({ where: { id: loserId }, data: { isArchived: true } });
  return { winnerId, loserId };
}

export async function mergeContacts(winnerId: string, loserId: string): Promise<{ winnerId: string; loserId: string }> {
  if (winnerId === loserId) throw new BadRequestException('winnerId and loserId must be different contacts');
  const prisma = getPrismaClient();
  const [winner, loser] = await Promise.all([
    prisma.contact.findUnique({ where: { id: winnerId } }),
    prisma.contact.findUnique({ where: { id: loserId } }),
  ]);
  if (!winner) throw new NotFoundException('Winner contact not found');
  if (!loser) throw new NotFoundException('Loser contact not found');

  await assertNoBlockingReferences('contact', loserId);

  // activities.contact_id is ON DELETE CASCADE and in-scope.
  await prisma.activity.updateMany({ where: { contactId: loserId }, data: { contactId: winnerId } });

  await prisma.contact.delete({ where: { id: loserId } });
  return { winnerId, loserId };
}

export async function mergeLeads(winnerId: string, loserId: string): Promise<{ winnerId: string; loserId: string }> {
  if (winnerId === loserId) throw new BadRequestException('winnerId and loserId must be different leads');
  const prisma = getPrismaClient();
  const [winner, loser] = await Promise.all([
    prisma.lead.findUnique({ where: { id: winnerId } }),
    prisma.lead.findUnique({ where: { id: loserId } }),
  ]);
  if (!winner) throw new NotFoundException('Winner lead not found');
  if (!loser) throw new NotFoundException('Loser lead not found');

  // No out-of-scope ON DELETE CASCADE references to leads exist (verified
  // against information_schema) — activities.lead_id and tasks.lead_id are
  // both CASCADE and both in-scope.
  await prisma.activity.updateMany({ where: { leadId: loserId }, data: { leadId: winnerId } });
  await prisma.task.updateMany({ where: { leadId: loserId }, data: { leadId: winnerId } });

  await prisma.lead.delete({ where: { id: loserId } });
  return { winnerId, loserId };
}
