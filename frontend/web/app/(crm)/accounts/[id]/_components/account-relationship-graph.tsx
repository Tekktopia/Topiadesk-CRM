'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { cn } from '@topiadesk/ui';
import { relationshipTypeLabel } from '../../../_lib/constants';
import type { AccountDetail, AccountRelationship } from '../../../_lib/types';

/**
 * Fixed-layout tree/radial diagram — no graph library (none exists
 * anywhere in this monorepo; every chart here is hand-built plain divs/SVG
 * per the dataviz skill's conventions, and a full force-directed physics
 * layout is unnecessary complexity for what's fundamentally a shallow
 * hierarchy). Two visually distinct tiers, computed with plain flex layout
 * rather than measured/absolutely-positioned coordinates:
 *   - vertical tree (solid connectors): Account.parentAccountId/subAccounts,
 *     the direct FK hierarchy.
 *   - a separate row below (dashed connectors): AccountRelationship rows —
 *     lateral links (referral source, competitor, joint venture, etc.),
 *     kept visually distinct from the hierarchy since they're a different
 *     relation entirely (e.g. a PARENT_SUBSIDIARY-typed AccountRelationship
 *     row does NOT imply the FK hierarchy above also reflects it).
 */
export function AccountRelationshipGraph({
  account,
  relationships,
}: {
  account: AccountDetail;
  relationships: AccountRelationship[];
}) {
  const laterals = relationships.map((r) => {
    const isA = r.accountAId === account.id;
    return {
      id: r.id,
      otherId: isA ? r.accountBId : r.accountAId,
      otherName: isA ? r.accountBName : r.accountAName,
      type: r.relationshipType,
    };
  });

  const isEmpty = !account.parentAccount && account.subAccounts.length === 0 && laterals.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">No hierarchy or relationships recorded for this account yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 py-6">
      <div className="flex flex-col items-center">
        {account.parentAccount ? (
          <>
            <GraphNode label="Parent" name={account.parentAccount.name} href={`/accounts/${account.parentAccount.id}`} />
            <Connector />
          </>
        ) : null}

        <GraphNode name={account.name} current />

        {account.subAccounts.length > 0 ? (
          <>
            <Connector />
            <div className="flex flex-wrap justify-center gap-8">
              {account.subAccounts.map((sub) => (
                <div key={sub.id} className="flex flex-col items-center">
                  <div className="h-4 w-px bg-border" aria-hidden />
                  <GraphNode label="Subsidiary" name={sub.name} href={`/accounts/${sub.id}`} />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {laterals.length > 0 ? (
        <div>
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Other relationships</p>
          <div className="flex flex-wrap justify-center gap-8">
            {laterals.map((l) => (
              <div key={l.id} className="flex flex-col items-center">
                <div className="h-4 w-px border-l border-dashed border-border" aria-hidden />
                <GraphNode label={relationshipTypeLabel(l.type)} name={l.otherName} href={`/accounts/${l.otherId}`} dashed />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Connector() {
  return <div className="h-6 w-px bg-border" aria-hidden />;
}

function GraphNode({
  name,
  label,
  href,
  current = false,
  dashed = false,
}: {
  name: string;
  label?: string;
  href?: string;
  current?: boolean;
  dashed?: boolean;
}) {
  const content = (
    <div
      className={cn(
        'flex min-w-[160px] flex-col items-center gap-0.5 rounded-lg px-4 py-2.5 text-center shadow-brand-sm',
        current ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground',
        dashed && !current ? 'border border-dashed border-border' : '',
      )}
    >
      {label ? (
        <span className={cn('text-[10px] font-medium uppercase tracking-wide', current ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {label}
        </span>
      ) : null}
      <span className="text-sm font-medium">{name}</span>
    </div>
  );

  if (!href || current) return content;
  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {content}
    </Link>
  );
}
