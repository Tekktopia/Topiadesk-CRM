'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@topiadesk/ui';
import {
  ASSIGNMENT_STRATEGIES,
  CASE_MANAGEMENT_ENTITY_TYPES,
  CASE_PRIORITIES,
  CASE_TYPES,
  casePriorityLabel,
  caseTypeLabel,
  humanize,
} from '../../_lib/constants';
import { useCreateAssignmentRule, useLeadSources, useTeams, useUpdateAssignmentRule } from '../../_lib/hooks';
import type { AssignmentRule, AssignmentStrategy, CaseManagementEntityType } from '../../_lib/types';

const UNSET = '__unset';

/**
 * `conditions` is sent to the backend as a loosely-typed JSON blob
 * (`CreateAssignmentRuleDto.conditions` is just `@IsObject()` — see
 * backend/api/src/modules/case-management/dto/assignment-rule.dto.ts's doc
 * comment: "small, evolving shape", no server-side shape enforcement
 * beyond "is an object"). The two controlled selects below can only ever
 * produce `{caseType?, priority?}` with values drawn from CASE_TYPES/
 * CASE_PRIORITIES, so this is unreachable through the UI's own inputs —
 * it's a defensive guard against future drift (a field renamed/added on
 * one side and not the other) and against this same jsonb column being
 * hand-edited via a raw PATCH /assignment-rules/:id curl call, which
 * `assignmentRuleConditionsSchema.strict()` would catch (a caseType/
 * priority value outside the known enums, or an unexpected extra key).
 *
 * LEAD rules use a disjoint pair (`source`, `minScore` — see
 * assignment-resolver.util.ts's leadConditionsMatch()) instead of caseType/
 * priority. Both pairs live in one non-discriminated `.strict()` shape
 * rather than a union: submit() below only ever populates the pair
 * matching the selected `entityType` (enforced by each Select's own
 * `disabled` prop, same as the existing caseType/priority fields already
 * do for entityType !== 'CASE'), so nothing legitimate ever produces a
 * mixed object — a union would just add ceremony for no extra safety here.
 * `source` is a plain string (a LeadSource.code from the admin-managed
 * lookup, see useLeadSources()), not a closed enum — it can't be
 * `z.enum(...)` since the valid set changes at runtime without a deploy.
 */
const assignmentRuleConditionsSchema = z
  .object({
    caseType: z.enum(CASE_TYPES).optional(),
    priority: z.enum(CASE_PRIORITIES).optional(),
    source: z.string().optional(),
    minScore: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export function AssignmentRuleFormDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: AssignmentRule;
}) {
  const isEdit = Boolean(rule);
  const [name, setName] = React.useState('');
  const [entityType, setEntityType] = React.useState<CaseManagementEntityType>('CASE');
  const [strategy, setStrategy] = React.useState<AssignmentStrategy>('ROUND_ROBIN');
  const [conditionCaseType, setConditionCaseType] = React.useState('');
  const [conditionPriority, setConditionPriority] = React.useState('');
  const [conditionSource, setConditionSource] = React.useState('');
  const [conditionMinScore, setConditionMinScore] = React.useState('');
  const [candidatePoolTeamId, setCandidatePoolTeamId] = React.useState('');
  const [requiredSkillTags, setRequiredSkillTags] = React.useState('');
  const [priority, setPriority] = React.useState(0);
  const [isActive, setIsActive] = React.useState(true);
  const [conditionsError, setConditionsError] = React.useState<string | null>(null);

  const { teams, isLoading: isLoadingTeams } = useTeams();
  const { data: leadSourcesData } = useLeadSources();
  const activeLeadSources = (leadSourcesData ?? []).filter((s) => s.isActive);

  React.useEffect(() => {
    if (!open) return;
    setConditionsError(null);
    if (rule) {
      setName(rule.name);
      setEntityType(rule.entityType);
      setStrategy(rule.strategy);
      const conditions = (rule.conditions ?? {}) as { caseType?: string; priority?: string; source?: string; minScore?: number };
      setConditionCaseType(conditions.caseType ?? '');
      setConditionPriority(conditions.priority ?? '');
      setConditionSource(conditions.source ?? '');
      setConditionMinScore(conditions.minScore !== undefined ? String(conditions.minScore) : '');
      setCandidatePoolTeamId(rule.candidatePoolTeamId ?? '');
      setRequiredSkillTags(rule.requiredSkillTags.join(', '));
      setPriority(rule.priority);
      setIsActive(rule.isActive);
    } else {
      setName('');
      setEntityType('CASE');
      setStrategy('ROUND_ROBIN');
      setConditionCaseType('');
      setConditionPriority('');
      setConditionSource('');
      setConditionMinScore('');
      setCandidatePoolTeamId('');
      setRequiredSkillTags('');
      setPriority(0);
      setIsActive(true);
    }
  }, [open, rule]);

  const createRule = useCreateAssignmentRule();
  const updateRule = useUpdateAssignmentRule(rule?.id ?? '');
  const isPending = createRule.isPending || updateRule.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rawConditions: Record<string, unknown> = {};
    if (entityType === 'LEAD') {
      if (conditionSource) rawConditions.source = conditionSource;
      if (conditionMinScore) rawConditions.minScore = Number(conditionMinScore);
    } else {
      if (conditionCaseType) rawConditions.caseType = conditionCaseType;
      if (conditionPriority) rawConditions.priority = conditionPriority;
    }

    const parsedConditions = assignmentRuleConditionsSchema.safeParse(rawConditions);
    if (!parsedConditions.success) {
      setConditionsError(parsedConditions.error.issues[0]?.message ?? 'Conditions are invalid.');
      return;
    }
    setConditionsError(null);
    const conditions = parsedConditions.data;

    const skillTags = requiredSkillTags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (isEdit && rule) {
      await updateRule.mutateAsync({
        name,
        strategy,
        conditions,
        candidatePoolTeamId: candidatePoolTeamId || undefined,
        requiredSkillTags: skillTags,
        priority,
        isActive,
      });
    } else {
      await createRule.mutateAsync({
        name,
        entityType,
        strategy,
        conditions,
        candidatePoolTeamId: candidatePoolTeamId || undefined,
        requiredSkillTags: skillTags,
        priority,
        isActive,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit assignment rule' : 'New assignment rule'}</DialogTitle>
          <DialogDescription>Routes newly created claims/tickets/leads matching the conditions below to a candidate owner.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Urgent complaints to Tier 2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as CaseManagementEntityType)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_MANAGEMENT_ENTITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humanize(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as AssignmentStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_STRATEGIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {humanize(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {entityType === 'LEAD' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Condition: lead source</Label>
                <Select value={conditionSource || UNSET} onValueChange={(v) => setConditionSource(v === UNSET ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Any</SelectItem>
                    {activeLeadSources.map((s) => (
                      <SelectItem key={s.id} value={s.code}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-min-score">Condition: minimum score</Label>
                <Input
                  id="rule-min-score"
                  type="number"
                  min={0}
                  max={100}
                  value={conditionMinScore}
                  onChange={(e) => setConditionMinScore(e.target.value)}
                  placeholder="Any"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Condition: ticket type</Label>
                <Select value={conditionCaseType || UNSET} onValueChange={(v) => setConditionCaseType(v === UNSET ? '' : v)} disabled={entityType !== 'CASE'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Any</SelectItem>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {caseTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Condition: priority</Label>
                <Select value={conditionPriority || UNSET} onValueChange={(v) => setConditionPriority(v === UNSET ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Any</SelectItem>
                    {CASE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {casePriorityLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {conditionsError ? <p className="text-sm text-destructive">{conditionsError}</p> : null}

          <div className="space-y-1.5">
            <Label htmlFor="rule-team">Candidate pool team</Label>
            {teams.length > 0 ? (
              <Select value={candidatePoolTeamId || UNSET} onValueChange={(v) => setCandidatePoolTeamId(v === UNSET ? '' : v)}>
                <SelectTrigger id="rule-team">
                  <SelectValue placeholder="No team (assign from all eligible users)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>No team (assign from all eligible users)</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-1.5">
                <Input
                  id="rule-team"
                  value={candidatePoolTeamId}
                  onChange={(e) => setCandidatePoolTeamId(e.target.value)}
                  placeholder={isLoadingTeams ? 'Loading teams…' : 'No team directory available for your role — paste a team UUID'}
                  disabled={isLoadingTeams}
                />
                {!isLoadingTeams ? <p className="text-xs text-muted-foreground">No team directory available for your role — paste a team UUID.</p> : null}
              </div>
            )}
          </div>

          {strategy === 'SKILL_BASED' ? (
            <div className="space-y-1.5">
              <Label htmlFor="rule-skills">Required skill tags</Label>
              <Input id="rule-skills" value={requiredSkillTags} onChange={(e) => setRequiredSkillTags(e.target.value)} placeholder="comma-separated, e.g. fire, marine" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">Rule priority</Label>
              <Input id="rule-priority" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isEdit ? 'Save changes' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
