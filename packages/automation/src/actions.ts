/**
 * The catalog of what an automation rule can DO.
 *
 * The handlers themselves are duplicated between backend/api and
 * backend/worker (they perform side effects against each side's own client
 * and context — see action-handler.ts's header). What must NOT be duplicated
 * is the answer to "which actions exist, what parameters does each take, and
 * which entity types can they run against" — the rule builder, the save-time
 * validator and both executors all need to agree on that, and three
 * independent copies of it is how a rule comes to be saved with parameters
 * that no handler reads.
 *
 * The pre-existing six actions were all case/claim ticket operations
 * (set status, set priority, assign, note, notify). That is a helpdesk's
 * repertoire, not a brokerage's: it cannot email a client, cannot raise a
 * follow-up, cannot update a field on a policy, and cannot tell another
 * system anything happened. The four added here close that gap, and each
 * declares which entity types it is meaningful for so the builder never
 * offers "set priority" on a Contact.
 */

import { AUTOMATION_ENTITY_TYPES, type AutomationEntityType } from './entity-registry';

export type ActionParamKind = 'string' | 'text' | 'enum' | 'uuid' | 'number' | 'boolean' | 'duration' | 'field';

export interface ActionParamMeta {
  name: string;
  label: string;
  kind: ActionParamKind;
  required: boolean;
  enumValues?: readonly string[];
  refersTo?: 'User' | 'Team';
  help?: string;
}

export interface ActionMeta {
  actionType: string;
  label: string;
  description: string;
  /** Which entity types this action makes sense for. */
  appliesTo: readonly AutomationEntityType[];
  params: readonly ActionParamMeta[];
  /**
   * True when running this action reaches outside the system — sends mail,
   * calls a URL. The scheduled scanner treats these as higher-consequence:
   * they are the ones a dry run must never actually perform, and the ones
   * worth showing an admin a count for before publishing.
   */
  external: boolean;
}

const TICKET_TYPES = ['CASE', 'CLAIM'] as const;
const ALL_TYPES = AUTOMATION_ENTITY_TYPES;

export const ACTION_CATALOG: readonly ActionMeta[] = [
  // ---- the six that already existed ----
  {
    actionType: 'SET_STATUS',
    label: 'Set status',
    description: 'Move the ticket or claim to a different status.',
    appliesTo: TICKET_TYPES,
    external: false,
    params: [{ name: 'status', label: 'New status', kind: 'string', required: true }],
  },
  {
    actionType: 'SET_PRIORITY',
    label: 'Set priority',
    description: 'Raise or lower the priority.',
    appliesTo: TICKET_TYPES,
    external: false,
    params: [
      { name: 'priority', label: 'New priority', kind: 'enum', required: true, enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
    ],
  },
  {
    actionType: 'ASSIGN_TO_USER',
    label: 'Assign to a person',
    description: 'Hand the record to a named colleague.',
    appliesTo: TICKET_TYPES,
    external: false,
    params: [{ name: 'userId', label: 'Person', kind: 'uuid', required: true, refersTo: 'User' }],
  },
  {
    actionType: 'ASSIGN_TO_TEAM',
    label: 'Assign to a team',
    description: 'Send the record to a team queue.',
    appliesTo: TICKET_TYPES,
    external: false,
    params: [{ name: 'teamId', label: 'Team', kind: 'uuid', required: true, refersTo: 'Team' }],
  },
  {
    actionType: 'ADD_INTERNAL_NOTE',
    label: 'Add an internal note',
    description: 'Record a note on the timeline. Never visible to the client.',
    appliesTo: TICKET_TYPES,
    external: false,
    params: [{ name: 'body', label: 'Note', kind: 'text', required: true, help: 'Supports {{field}} placeholders.' }],
  },
  {
    actionType: 'SEND_NOTIFICATION',
    label: 'Notify a colleague',
    description: 'Send an in-app notification to someone internally.',
    appliesTo: ALL_TYPES,
    external: false,
    params: [
      { name: 'userId', label: 'Person', kind: 'uuid', required: false, refersTo: 'User', help: 'Leave empty to notify whoever owns the record.' },
      { name: 'message', label: 'Message', kind: 'text', required: true, help: 'Supports {{field}} placeholders.' },
    ],
  },

  // ---- added: the four a brokerage actually asked for ----
  {
    // Param shape matches the handler that already exists in the worker —
    // `recipientMode` with USER/TEAM/CASE_CUSTOMER — rather than a tidier
    // invented one, so rules saved against the old build keep working. What
    // IS new: CASE_CUSTOMER resolves through the entity registry, so it
    // reaches the contact on a policy or the owner of an opportunity, not
    // only a ticket's customer.
    actionType: 'SEND_EMAIL',
    label: 'Send an email',
    description: 'Email the client on this record, a colleague, or a team — through the firm’s configured mail settings.',
    appliesTo: ALL_TYPES,
    external: true,
    params: [
      {
        name: 'recipientMode',
        label: 'Send to',
        kind: 'enum',
        required: true,
        enumValues: ['CASE_CUSTOMER', 'USER', 'TEAM', 'ADDRESS'],
        help: 'CASE_CUSTOMER sends to the client or contact on the record itself.',
      },
      { name: 'recipientUserId', label: 'Colleague', kind: 'uuid', required: false, refersTo: 'User' },
      { name: 'recipientTeamId', label: 'Team', kind: 'uuid', required: false, refersTo: 'Team' },
      { name: 'toAddress', label: 'Email address', kind: 'string', required: false, help: 'Used when sending to a fixed address.' },
      { name: 'subject', label: 'Subject', kind: 'string', required: true, help: 'Supports {{field}} placeholders.' },
      { name: 'body', label: 'Message', kind: 'text', required: true, help: 'Supports {{field}} placeholders.' },
    ],
  },
  {
    actionType: 'NOTIFY_TEAMS_CHANNEL',
    label: 'Post to a Teams channel',
    description: 'Post a card to a Microsoft Teams channel through a configured incoming webhook.',
    appliesTo: ALL_TYPES,
    external: true,
    params: [
      { name: 'connectorId', label: 'Teams connector', kind: 'uuid', required: true },
      { name: 'title', label: 'Title', kind: 'string', required: true, help: 'Supports {{field}} placeholders.' },
      { name: 'body', label: 'Message', kind: 'text', required: true, help: 'Supports {{field}} placeholders.' },
    ],
  },
  {
    actionType: 'CREATE_TASK',
    label: 'Create a follow-up task',
    description: 'Raise a task against this record so somebody picks it up.',
    appliesTo: ALL_TYPES,
    external: false,
    params: [
      { name: 'title', label: 'Task title', kind: 'string', required: true, help: 'Supports {{field}} placeholders.' },
      { name: 'description', label: 'Details', kind: 'text', required: false },
      { name: 'assigneeId', label: 'Assign to', kind: 'uuid', required: false, refersTo: 'User', help: 'Leave empty to assign to whoever owns the record.' },
      { name: 'priority', label: 'Priority', kind: 'enum', required: false, enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      { name: 'dueInDays', label: 'Due in (days)', kind: 'number', required: false },
    ],
  },
  {
    actionType: 'UPDATE_FIELD',
    label: 'Update a field',
    description: 'Set any editable field on the record — the general-purpose action for everything the specific ones don’t cover.',
    appliesTo: ALL_TYPES,
    external: false,
    params: [
      { name: 'field', label: 'Field', kind: 'field', required: true },
      { name: 'value', label: 'New value', kind: 'string', required: true, help: 'Leave empty to clear the field.' },
    ],
  },
  {
    actionType: 'CALL_WEBHOOK',
    label: 'Call a webhook',
    description: 'POST the record to another system. The escape hatch for anything this list doesn’t do.',
    appliesTo: ALL_TYPES,
    external: true,
    params: [
      { name: 'url', label: 'URL', kind: 'string', required: true, help: 'Must be https.' },
      { name: 'secret', label: 'Signing secret', kind: 'string', required: false, help: 'Sent as an X-TopiaDesk-Signature HMAC so the receiver can verify the call came from us.' },
    ],
  },
] as const;

export function getActionMeta(actionType: string): ActionMeta | undefined {
  return ACTION_CATALOG.find((a) => a.actionType === actionType);
}

export function actionsForEntityType(entityType: AutomationEntityType): ActionMeta[] {
  return ACTION_CATALOG.filter((a) => a.appliesTo.includes(entityType));
}

/**
 * Fields UPDATE_FIELD must never write.
 *
 * UPDATE_FIELD is deliberately general — it is the action that stops every
 * future "can automation set X?" becoming a new handler. That generality is
 * also its risk: `id` and the audit timestamps are the record's identity and
 * its history, and letting a rule rewrite them would corrupt referential
 * integrity and make the audit trail lie about when something changed.
 * `anonymizedAt` is here for the same reason it appears in the registry's
 * baseline exclusions — clearing it would silently reverse a GDPR erasure.
 */
const IMMUTABLE_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'anonymizedAt', 'createdById', 'tenantId']);

export interface ActionValidationIssue {
  index: number;
  actionType: string;
  message: string;
}

/**
 * Save-time validation for a rule's action list.
 *
 * Previously nothing checked this: an action naming a handler that does not
 * exist, or omitting the parameter its handler reads, was accepted and only
 * revealed itself as a failed execution log entry later — if anyone looked.
 */
export function validateActions(actions: unknown, entityType: AutomationEntityType | undefined): ActionValidationIssue[] {
  const issues: ActionValidationIssue[] = [];
  if (!Array.isArray(actions) || actions.length === 0) {
    return [{ index: -1, actionType: '', message: 'Add at least one action — a rule that does nothing has no effect.' }];
  }

  actions.forEach((raw, index) => {
    const action = raw as { actionType?: unknown; params?: unknown };
    const actionType = typeof action?.actionType === 'string' ? action.actionType : '';
    const meta = getActionMeta(actionType);
    if (!meta) {
      issues.push({ index, actionType, message: `"${actionType || '(none)'}" is not an action this system can perform.` });
      return;
    }
    if (entityType && !meta.appliesTo.includes(entityType)) {
      issues.push({ index, actionType, message: `"${meta.label}" cannot be used on this kind of record.` });
      return;
    }
    const params = (action.params ?? {}) as Record<string, unknown>;
    for (const param of meta.params) {
      const value = params[param.name];
      if (param.required && (value === undefined || value === null || value === '')) {
        issues.push({ index, actionType, message: `"${meta.label}" needs ${param.label.toLowerCase()}.` });
      }
      if (param.kind === 'enum' && typeof value === 'string' && param.enumValues && !param.enumValues.includes(value)) {
        issues.push({ index, actionType, message: `"${value}" is not a valid ${param.label.toLowerCase()}.` });
      }
    }
    if (actionType === 'CALL_WEBHOOK') {
      const url = typeof params.url === 'string' ? params.url : '';
      if (url && !url.startsWith('https://')) {
        issues.push({ index, actionType, message: 'Webhook URLs must use https.' });
      }
    }

    // Which recipient field SEND_EMAIL needs depends on the mode chosen, so
    // the flat required/optional flags above cannot express it. Without this,
    // a rule set to "send to a team" with no team picked saves cleanly and
    // then fails on every single record it matches.
    if (actionType === 'SEND_EMAIL') {
      const mode = typeof params.recipientMode === 'string' ? params.recipientMode : '';
      if (mode === 'USER' && !params.recipientUserId) {
        issues.push({ index, actionType, message: 'Choose which colleague to email.' });
      }
      if (mode === 'TEAM' && !params.recipientTeamId) {
        issues.push({ index, actionType, message: 'Choose which team to email.' });
      }
      if (mode === 'ADDRESS') {
        const to = typeof params.toAddress === 'string' ? params.toAddress : '';
        if (!to.includes('@')) issues.push({ index, actionType, message: 'Enter a valid email address.' });
      }
    }

    if (actionType === 'UPDATE_FIELD') {
      const field = typeof params.field === 'string' ? params.field : '';
      if (field && IMMUTABLE_FIELDS.has(field)) {
        issues.push({ index, actionType, message: `"${field}" is maintained by the system and cannot be changed by automation.` });
      }
    }
  });

  return issues;
}

/**
 * Fills {{field}} placeholders from the triggering record.
 *
 * Deliberately narrow: it substitutes scalar values from the entity and
 * nothing else — no expressions, no property paths, no code. An admin writing
 * a rule is composing a message, not scripting, and a template language here
 * would be a way to run arbitrary logic against every record in the book.
 *
 * An unknown placeholder resolves to empty rather than being left as literal
 * `{{whatever}}` — a client should never receive a message with template
 * syntax in it.
 */
export function renderTemplate(template: string, entity: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = entity[key];
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    if (typeof value === 'object' && 'toNumber' in (value as object)) {
      return String((value as { toNumber(): number }).toNumber());
    }
    return String(value);
  });
}
