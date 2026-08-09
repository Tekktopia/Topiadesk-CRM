'use client';

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@topiadesk/ui';
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES } from '../../_lib/types';
import { caseStatusLabel, casePriorityLabel, caseTypeLabel } from '../../_lib/constants';
import { useCaseCategories, useDirectoryUsers, usePolicyLookups, useTeams } from '../../_lib/hooks';

/**
 * One control per possible condition/action field, covering the union of
 * BUSINESS_RULE_CONDITION_FIELDS.CASE and BUSINESS_RULE_ACTION_FIELDS.CASE
 * (types.ts) — mirrors workflow-builder-view.tsx's per-field value-Select
 * chain for the fields the two sets share (status/priority/caseType/
 * categoryId/assignedTeamId), extended with the action-only fields
 * (subject/description as free text, accountId/policyId/assignedToId as
 * lookups already used elsewhere in the Case forms).
 */
export function BusinessRuleFieldValueInput({
  field,
  value,
  onChange,
}: {
  field: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: categories } = useCaseCategories();
  const { teams } = useTeams();
  const { accounts, policies } = usePolicyLookups();
  const { users } = useDirectoryUsers();

  switch (field) {
    case 'status':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a status" />
          </SelectTrigger>
          <SelectContent>
            {CASE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {caseStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'priority':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a priority" />
          </SelectTrigger>
          <SelectContent>
            {CASE_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {casePriorityLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'caseType':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a ticket type" />
          </SelectTrigger>
          <SelectContent>
            {CASE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {caseTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'categoryId':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'assignedTeamId':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'accountId':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'policyId':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a policy" />
          </SelectTrigger>
          <SelectContent>
            {policies.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'assignedToId':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'subject':
    case 'description':
      return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field === 'subject' ? 'Exact subject text' : 'Exact description text'} />;
    default:
      return <p className="text-xs text-muted-foreground">Choose a field above first.</p>;
  }
}
