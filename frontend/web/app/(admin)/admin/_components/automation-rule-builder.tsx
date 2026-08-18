'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FlaskConical, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
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
  Textarea,
  toast,
} from '@topiadesk/ui';
import { apiFetch } from '../_lib/api';
import type {
  AutomationActionDto,
  AutomationCatalogDto,
  AutomationConditionRule,
  AutomationConditionsShape,
  AutomationRuleDto,
  AutomationSimulationDto,
  AutomationTriggerType,
  CreateAutomationRuleBody,
  UpdateAutomationRuleBody,
} from '../_lib/types';

/**
 * Visual rule builder, replacing the raw-JSON dialog.
 *
 * Authoring a rule used to mean hand-writing two JSON blobs into textareas,
 * against a shape documented only in a backend DTO comment. That is not a
 * thing a compliance lead can do, and worse, nothing validated it: a typo'd
 * field name was accepted and then silently matched EVERYTHING, because the
 * old matcher skipped conditions it didn't recognise rather than failing.
 *
 * Every choice offered here comes from GET /crm/automation-rules/catalog,
 * which the backend serves from the same shared package the engine runs on —
 * so the builder cannot offer a field, an operator or an action that the
 * engine will then ignore.
 *
 * The "Test this rule" button is the other half. A rule that mutates records
 * in bulk should be previewable before it is published; this shows how many
 * records match right now, a sample of which ones, and what would happen to
 * each — without performing any of it.
 */

const OPERATOR_LABELS: Record<string, string> = {
  EQUALS: 'is',
  NOT_EQUALS: 'is not',
  IN: 'is one of',
  NOT_IN: 'is none of',
  IS_EMPTY: 'is empty',
  IS_NOT_EMPTY: 'is set',
  GREATER_THAN: 'is more than',
  LESS_THAN: 'is less than',
  CONTAINS: 'contains',
  OLDER_THAN: 'is more than … ago',
  NEWER_THAN: 'is within the last …',
  WITHIN_NEXT: 'falls within the next …',
  OVERDUE_BY: 'is overdue by more than …',
};

const RELATIVE_OPERATORS = new Set(['OLDER_THAN', 'NEWER_THAN', 'WITHIN_NEXT', 'OVERDUE_BY']);
const NULLARY_OPERATORS = new Set(['IS_EMPTY', 'IS_NOT_EMPTY']);

/** Operators that make sense for a given field kind — a date field should not offer "contains". */
function operatorsForKind(kind: string, all: string[]): string[] {
  if (kind === 'date') return all.filter((o) => ['EQUALS', 'IS_EMPTY', 'IS_NOT_EMPTY', ...RELATIVE_OPERATORS].includes(o));
  if (kind === 'number') return all.filter((o) => ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'IS_EMPTY', 'IS_NOT_EMPTY'].includes(o));
  if (kind === 'boolean') return ['EQUALS'];
  if (kind === 'enum') return all.filter((o) => ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'IS_EMPTY', 'IS_NOT_EMPTY'].includes(o));
  return all.filter((o) => !RELATIVE_OPERATORS.has(o));
}

interface ActionDraft {
  actionType: string;
  params: Record<string, unknown>;
}

export function AutomationRuleBuilder({
  target,
  triggerType,
  open,
  onOpenChange,
}: {
  target: 'create' | AutomationRuleDto;
  triggerType: AutomationTriggerType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = target !== 'create';
  const isSchedule = triggerType === 'SCHEDULE';

  const { data: catalog } = useQuery({
    queryKey: ['automation-catalog'],
    queryFn: () => apiFetch<AutomationCatalogDto>('/api/crm/automation-rules/catalog'),
    // The vocabulary changes only when the product does, so refetching it per
    // dialog open is pure overhead.
    staleTime: 60 * 60 * 1000,
  });

  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [match, setMatch] = useState<'ALL' | 'ANY'>('ALL');
  const [rules, setRules] = useState<AutomationConditionRule[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);
  const [cron, setCron] = useState('0 8 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [maxPerRun, setMaxPerRun] = useState('200');
  const [repeat, setRepeat] = useState<'ONCE_PER_RECORD' | 'EVERY_RUN'>('ONCE_PER_RECORD');
  const [isActive, setIsActive] = useState(true);
  const [simulation, setSimulation] = useState<AutomationSimulationDto | null>(null);

  // Reset from the target every time the dialog opens, so reopening after a
  // cancel never shows the abandoned edit.
  useEffect(() => {
    if (!open) return;
    setSimulation(null);
    if (target === 'create') {
      setName('');
      setEntityType('');
      setMatch('ALL');
      setRules([]);
      setActions([]);
      setCron('0 8 * * *');
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      setMaxPerRun('200');
      setRepeat('ONCE_PER_RECORD');
      setIsActive(true);
      return;
    }
    const conditions = (target.conditions ?? {}) as AutomationConditionsShape;
    setName(target.name);
    setEntityType(conditions.entityType ?? '');
    setMatch(conditions.match === 'ANY' ? 'ANY' : 'ALL');
    setRules(Array.isArray(conditions.rules) ? conditions.rules : []);
    setActions(Array.isArray(target.actions) ? (target.actions as ActionDraft[]) : []);
    setCron(target.scheduleCron ?? '0 8 * * *');
    setTimezone(target.scheduleTimezone ?? 'UTC');
    setMaxPerRun(String(conditions.maxEntitiesPerRun ?? 200));
    setRepeat(conditions.repeat === 'EVERY_RUN' ? 'EVERY_RUN' : 'ONCE_PER_RECORD');
    setIsActive(target.isActive);
  }, [open, target]);

  const entityMeta = useMemo(
    () => catalog?.entityTypes.find((e) => e.entityType === entityType),
    [catalog, entityType],
  );
  const availableActions = useMemo(
    () => (catalog?.actions ?? []).filter((a) => !entityType || a.appliesTo.includes(entityType)),
    [catalog, entityType],
  );

  function buildBody(): CreateAutomationRuleBody {
    const conditions: AutomationConditionsShape = {
      entityType: entityType || undefined,
      match,
      rules,
      ...(isSchedule ? { maxEntitiesPerRun: Number(maxPerRun) || 200, repeat } : {}),
    };
    return {
      name,
      triggerType,
      conditions,
      actions,
      isActive,
      ...(isSchedule ? { scheduleCron: cron, scheduleTimezone: timezone } : {}),
    };
  }

  const simulate = useMutation({
    mutationFn: () =>
      apiFetch<AutomationSimulationDto>('/api/crm/automation-rules/simulate', {
        method: 'POST',
        body: JSON.stringify(buildBody()),
      }),
    onSuccess: setSimulation,
    onError: (err: Error) => toast.error(err.message || 'Could not test the rule'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (isEdit) {
        return apiFetch<AutomationRuleDto>(`/api/crm/automation-rules/${target.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body as UpdateAutomationRuleBody),
        });
      }
      return apiFetch<AutomationRuleDto>('/api/crm/automation-rules', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save the rule'),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  function updateRule(index: number, patch: Partial<AutomationConditionRule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSimulation(null);
  }

  function updateActionParam(index: number, paramName: string, value: unknown) {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, params: { ...a.params, [paramName]: value } } : a)));
    setSimulation(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            {isSchedule
              ? 'Runs on a schedule, finds every record matching the conditions, and acts on each one.'
              : 'Runs the moment a record changes, on the record that changed.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chase clients whose policy expires in 30 days"
              required
            />
          </div>

          {/* ---- what it applies to ---- */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Which records</h3>
            <Select
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v);
                // Fields and actions are per-entity-type, so anything already
                // chosen is meaningless against the new one. Clearing beats
                // carrying over conditions that would now fail validation.
                setRules([]);
                setActions([]);
                setSimulation(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a record type" />
              </SelectTrigger>
              <SelectContent>
                {(catalog?.entityTypes ?? []).map((e) => (
                  <SelectItem key={e.entityType} value={e.entityType}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* ---- when it runs ---- */}
          {isSchedule ? (
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">How often</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select
                    value={(catalog?.schedulePresets ?? []).some((p) => p.cron === cron) ? cron : 'CUSTOM'}
                    onValueChange={(v) => {
                      if (v !== 'CUSTOM') setCron(v);
                      setSimulation(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalog?.schedulePresets ?? []).map((p) => (
                        <SelectItem key={p.key} value={p.cron}>
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="CUSTOM">Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-tz">Timezone</Label>
                  <Input id="rule-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Africa/Lagos" />
                </div>
              </div>
              {!(catalog?.schedulePresets ?? []).some((p) => p.cron === cron) ? (
                <div className="space-y-2">
                  <Label htmlFor="rule-cron">Cron expression</Label>
                  <Input id="rule-cron" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 8 * * 1-5" className="font-mono" />
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ---- conditions ---- */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Conditions</h3>
              {rules.length > 1 ? (
                <Select value={match} onValueChange={(v) => setMatch(v as 'ALL' | 'ANY')}>
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Match all of these</SelectItem>
                    <SelectItem value="ANY">Match any of these</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No conditions — this rule applies to every {entityMeta?.label.toLowerCase() ?? 'record'}.
              </p>
            ) : null}

            {rules.map((rule, index) => {
              const fieldMeta = entityMeta?.fields.find((f) => f.name === rule.field);
              const operators = operatorsForKind(fieldMeta?.kind ?? 'string', catalog?.operators ?? []);
              return (
                <div key={index} className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
                  <div className="min-w-[9rem] flex-1">
                    <Select value={rule.field} onValueChange={(v) => updateRule(index, { field: v, value: undefined })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {(entityMeta?.fields ?? []).map((f) => (
                          <SelectItem key={f.name} value={f.name}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[9rem] flex-1">
                    <Select value={rule.operator} onValueChange={(v) => updateRule(index, { operator: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="is" />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((op) => (
                          <SelectItem key={op} value={op}>
                            {OPERATOR_LABELS[op] ?? op}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {NULLARY_OPERATORS.has(rule.operator) ? null : RELATIVE_OPERATORS.has(rule.operator) ? (
                    <>
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-20"
                        value={String(rule.value ?? '')}
                        onChange={(e) => updateRule(index, { value: Number(e.target.value) })}
                        placeholder="30"
                      />
                      <Select value={rule.unit ?? 'DAYS'} onValueChange={(v) => updateRule(index, { unit: v as 'MINUTES' | 'HOURS' | 'DAYS' })}>
                        <SelectTrigger className="h-9 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MINUTES">minutes</SelectItem>
                          <SelectItem value="HOURS">hours</SelectItem>
                          <SelectItem value="DAYS">days</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  ) : fieldMeta?.kind === 'enum' ? (
                    <div className="min-w-[9rem] flex-1">
                      <Select value={String(rule.value ?? '')} onValueChange={(v) => updateRule(index, { value: v })}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Value" />
                        </SelectTrigger>
                        <SelectContent>
                          {(fieldMeta.enumValues ?? []).map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Input
                      className="h-9 min-w-[9rem] flex-1"
                      value={String(rule.value ?? '')}
                      onChange={(e) => updateRule(index, { value: e.target.value })}
                      placeholder="Value"
                    />
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-destructive hover:text-destructive"
                    onClick={() => {
                      setRules((prev) => prev.filter((_, i) => i !== index));
                      setSimulation(null);
                    }}
                    aria-label="Remove condition"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!entityType}
              onClick={() => setRules((prev) => [...prev, { field: '', operator: 'EQUALS' }])}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add condition
            </Button>
          </section>

          {/* ---- actions ---- */}
          <section className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">What happens</h3>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions yet — a rule with no actions has no effect.</p>
            ) : null}

            {actions.map((action, index) => {
              const actionMeta = catalog?.actions.find((a) => a.actionType === action.actionType);
              return (
                <div key={index} className="space-y-3 rounded-md bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={action.actionType}
                      onValueChange={(v) => {
                        setActions((prev) => prev.map((a, i) => (i === index ? { actionType: v, params: {} } : a)));
                        setSimulation(null);
                      }}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder="Choose an action" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableActions.map((a) => (
                          <SelectItem key={a.actionType} value={a.actionType}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {actionMeta?.external ? (
                      // Worth flagging: these leave the system. An admin
                      // should know which of their actions email a client or
                      // call another server before they publish.
                      <Badge variant="outline">Sends externally</Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-destructive hover:text-destructive"
                      onClick={() => {
                        setActions((prev) => prev.filter((_, i) => i !== index));
                        setSimulation(null);
                      }}
                      aria-label="Remove action"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>

                  {actionMeta ? <p className="text-xs text-muted-foreground">{actionMeta.description}</p> : null}

                  {(actionMeta?.params ?? []).map((param) => (
                    <ActionParamField
                      key={param.name}
                      param={param}
                      value={action.params[param.name]}
                      entityFields={entityMeta?.fields ?? []}
                      onChange={(v) => updateActionParam(index, param.name, v)}
                    />
                  ))}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!entityType}
              onClick={() => setActions((prev) => [...prev, { actionType: '', params: {} }])}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add action
            </Button>
          </section>

          {/* ---- safety, schedule rules only ---- */}
          {isSchedule ? (
            <section className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-max">Most records per run</Label>
                <Input id="rule-max" type="number" min={1} max={1000} value={maxPerRun} onChange={(e) => setMaxPerRun(e.target.value)} />
                <p className="text-xs text-muted-foreground">If more than this match, the rule stops rather than acting on them all.</p>
              </div>
              <div className="space-y-2">
                <Label>Repeat</Label>
                <Select value={repeat} onValueChange={(v) => setRepeat(v as 'ONCE_PER_RECORD' | 'EVERY_RUN')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONCE_PER_RECORD">Act on each record once</SelectItem>
                    <SelectItem value="EVERY_RUN">Act every time it matches</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Most conditions stay true for days, so acting once per record is usually what you want.
                </p>
              </div>
            </section>
          ) : null}

          {/* ---- dry run ---- */}
          {simulation ? <SimulationPanel simulation={simulation} /> : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => simulate.mutate()} disabled={simulate.isPending || !entityType}>
              <FlaskConical className="h-4 w-4" aria-hidden /> {simulate.isPending ? 'Testing…' : 'Test this rule'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionParamField({
  param,
  value,
  entityFields,
  onChange,
}: {
  param: AutomationActionDto['params'][number];
  value: unknown;
  entityFields: { name: string; label: string }[];
  onChange: (value: unknown) => void;
}) {
  const id = `param-${param.name}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {param.label}
        {param.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {param.kind === 'enum' ? (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-9">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {(param.enumValues ?? []).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : param.kind === 'field' ? (
        // UPDATE_FIELD's target: the same field list the conditions use, so
        // the two halves of a rule can't disagree about what exists.
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-9">
            <SelectValue placeholder="Choose a field" />
          </SelectTrigger>
          <SelectContent>
            {entityFields.map((f) => (
              <SelectItem key={f.name} value={f.name}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : param.kind === 'text' ? (
        <Textarea id={id} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input
          id={id}
          type={param.kind === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange(param.kind === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
      {param.help ? <p className="text-xs text-muted-foreground">{param.help}</p> : null}
    </div>
  );
}

function SimulationPanel({ simulation }: { simulation: AutomationSimulationDto }) {
  if (!simulation.valid) {
    return (
      <section className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden /> This rule can’t run yet
        </h3>
        <ul className="space-y-1 text-sm text-foreground">
          {simulation.issues.map((issue, i) => (
            <li key={i}>• {issue.message}</li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> If this ran right now
      </h3>

      <p className="text-sm text-foreground">
        <span className="font-semibold tabular-nums">{simulation.matchCount}</span> record
        {simulation.matchCount === 1 ? '' : 's'} match
        {simulation.alreadyHandledCount > 0 ? `, ${simulation.alreadyHandledCount} of which were already handled and would be skipped` : ''}.
      </p>

      {simulation.exceedsCap ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>That is more than this rule’s per-run limit, so it would stop instead of running. Narrow the conditions or raise the limit.</span>
        </p>
      ) : null}

      {simulation.plannedActions.length > 0 ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {simulation.plannedActions.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
      ) : null}

      {simulation.sample.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">For example</p>
          <ul className="space-y-0.5 text-sm text-foreground">
            {simulation.sample.map((s) => (
              <li key={s.id}>• {s.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {simulation.schedulePreview && simulation.schedulePreview.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next runs</p>
          <p className="text-sm text-foreground">
            {simulation.schedulePreview.slice(0, 3).map((iso) => new Date(iso).toLocaleString()).join(' · ')}
          </p>
        </div>
      ) : null}
    </section>
  );
}
