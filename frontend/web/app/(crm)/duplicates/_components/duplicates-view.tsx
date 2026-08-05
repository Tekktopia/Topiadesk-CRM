'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { EmptyState } from '../../_components/empty-state';
import { PageHeader } from '../../_components/page-header';
import { humanize } from '../../_lib/constants';
import { useCheckAccountDuplicates, useCheckContactDuplicates, useCheckLeadDuplicates } from '../../_lib/hooks';
import type { DuplicateGroup, DuplicateMatch, DuplicateTier } from '../../_lib/types';
import { MergeDialog, type MergeEntityType } from './merge-dialog';

const TIER_META: Record<DuplicateTier, { label: string; variant: 'destructive' | 'warning' | 'secondary'; blurb: string }> = {
  EXACT: { label: 'Exact', variant: 'destructive', blurb: 'Same email or phone' },
  STRONG: { label: 'Strong', variant: 'warning', blurb: 'Same name plus a matching email/phone' },
  POSSIBLE: { label: 'Possible', variant: 'secondary', blurb: 'Similar name (trigram match)' },
};

export function DuplicatesView() {
  const searchParams = useSearchParams();
  const entityParam = searchParams.get('entity');
  const [entityType, setEntityType] = React.useState<MergeEntityType>(
    entityParam === 'CONTACT' || entityParam === 'LEAD' ? entityParam : 'ACCOUNT',
  );

  const [name, setName] = React.useState('');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [companyName, setCompanyName] = React.useState('');

  const [results, setResults] = React.useState<DuplicateGroup[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = React.useState(false);

  const checkAccounts = useCheckAccountDuplicates();
  const checkContacts = useCheckContactDuplicates();
  const checkLeads = useCheckLeadDuplicates();
  const isSearching = checkAccounts.isPending || checkContacts.isPending || checkLeads.isPending;

  function switchEntity(value: string) {
    setEntityType(value as MergeEntityType);
    setResults(null);
    setSelected(new Set());
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setSelected(new Set());
    let groups: DuplicateGroup[];
    if (entityType === 'ACCOUNT') {
      groups = await checkAccounts.mutateAsync({ name: name || undefined, email: email || undefined, phone: phone || undefined });
    } else if (entityType === 'CONTACT') {
      groups = await checkContacts.mutateAsync({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });
    } else {
      groups = await checkLeads.mutateAsync({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        companyName: companyName || undefined,
      });
    }
    setResults(groups);
  }

  const allMatches: DuplicateMatch[] = (results ?? []).flatMap((g) => g.matches);
  const selectedMatches = allMatches.filter((m) => selected.has(m.id));
  const canMerge = selectedMatches.length === 2;
  const hasAnyMatch = allMatches.length > 0;

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const searchDisabled =
    entityType === 'ACCOUNT' ? !name && !email && !phone : !email && !phone && !(firstName && lastName);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Duplicates"
        description="Search for records that look like the same account, contact, or lead — then merge a pair, keeping the survivor you choose."
      />

      <Tabs value={entityType} onValueChange={switchEntity}>
        <TabsList>
          {(['ACCOUNT', 'CONTACT', 'LEAD'] as const).map((t) => (
            <TabsTrigger key={t} value={t}>
              {humanize(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {entityType === 'ACCOUNT' ? (
              <div className="min-w-[200px] flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-name">
                  Account name
                </label>
                <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delta Oilfield" />
              </div>
            ) : (
              <>
                <div className="w-full space-y-1.5 sm:w-44">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-first">
                    First name
                  </label>
                  <Input id="dup-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="w-full space-y-1.5 sm:w-44">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-last">
                    Last name
                  </label>
                  <Input id="dup-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </>
            )}
            {entityType === 'LEAD' ? (
              <div className="w-full space-y-1.5 sm:w-44">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-company">
                  Company
                </label>
                <Input id="dup-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
            ) : null}
            <div className="w-full space-y-1.5 sm:w-56">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-email">
                Email
              </label>
              <Input id="dup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="dup-phone">
                Phone
              </label>
              <Input id="dup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" disabled={isSearching || searchDisabled}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search aria-hidden />}
              Search
            </Button>
          </form>
          {entityType !== 'ACCOUNT' ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Name-based matching needs both first and last name; email or phone alone also works.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {results !== null ? (
        <Card>
          <CardContent className="space-y-6 pt-6">
            {!hasAnyMatch ? (
              <EmptyState
                title="No duplicate candidates found"
                description="Nothing visible to you matches these criteria — try an email, phone, or a fuller name."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Select exactly two records to merge — {selected.size} selected.
                  </p>
                  <Button type="button" disabled={!canMerge} onClick={() => setMergeOpen(true)}>
                    Merge selected
                  </Button>
                </div>
                {(results ?? [])
                  .filter((group) => group.matches.length > 0)
                  .map((group) => (
                    <div key={group.tier} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={TIER_META[group.tier].variant}>{TIER_META[group.tier].label}</Badge>
                        <span className="text-xs text-muted-foreground">{TIER_META[group.tier].blurb}</span>
                      </div>
                      <div className="space-y-1.5">
                        {group.matches.map((match) => (
                          <label
                            key={match.id}
                            className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-input accent-primary"
                              checked={selected.has(match.id)}
                              onChange={(e) => toggleSelected(match.id, e.target.checked)}
                            />
                            <span className="flex-1 font-medium text-foreground">{match.displayName}</span>
                            <span className="text-xs text-muted-foreground">matched on {match.matchedOn.join(', ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        entityType={entityType}
        pair={canMerge ? [selectedMatches[0]!, selectedMatches[1]!] : null}
        onMerged={() => {
          setResults(null);
          setSelected(new Set());
        }}
      />
    </div>
  );
}
