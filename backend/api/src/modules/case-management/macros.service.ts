import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '@topiadesk/db';
import { executeActions, type ActionExecutionResult, type ActionSpec, type CaseManagementEntityRef } from './automation/action-handler';
import './automation/handlers';
import type { MacroPreviewChangeDto } from './dto/macro.dto';

function describeAction(action: ActionSpec, entityType: 'CLAIM' | 'CASE', entity: Record<string, unknown>): MacroPreviewChangeDto {
  switch (action.actionType) {
    case 'SET_STATUS':
      return { actionType: action.actionType, description: `Change status to ${String(action.params.status)}`, currentValue: entity.status, newValue: action.params.status };
    case 'SET_PRIORITY':
      return { actionType: action.actionType, description: `Change priority to ${String(action.params.priority)}`, currentValue: entity.priority, newValue: action.params.priority };
    case 'ASSIGN_TO_USER':
      return {
        actionType: action.actionType,
        description: `Assign to user ${String(action.params.userId)}`,
        currentValue: entityType === 'CLAIM' ? entity.adjusterId : entity.assignedToId,
        newValue: action.params.userId,
      };
    case 'ASSIGN_TO_TEAM':
      return { actionType: action.actionType, description: `Assign to team ${String(action.params.teamId)}`, currentValue: entity.assignedTeamId, newValue: action.params.teamId };
    case 'ADD_INTERNAL_NOTE':
      return { actionType: action.actionType, description: `Add internal note: "${String(action.params.body ?? '').slice(0, 80)}"` };
    case 'SEND_NOTIFICATION':
      return { actionType: action.actionType, description: `Send notification: "${String(action.params.title ?? '')}"` };
    default:
      return { actionType: action.actionType, description: `Unrecognized actionType "${action.actionType}" — applying this macro would fail on this step` };
  }
}

/**
 * Shared by macros.controller.ts's POST :id/preview and
 * cases.controller.ts's POST :id/apply-macro/:macroId — Macro fires
 * synchronously via `executeActions` against the same action-handler
 * registry AutomationRule uses (automation/action-handler.ts), per the
 * build brief. `apply` is intentionally NOT wrapped in the leads.controller
 * convert()-style sequential-with-compensation pattern: `executeActions`
 * already runs each action independently and best-effort (one failing
 * action doesn't roll back or block the others — see its own doc comment),
 * so there is nothing to compensate for here; a partially-applied macro is
 * the documented, correct outcome, surfaced via the returned per-action
 * results.
 */
@Injectable()
export class MacrosService {
  async preview(macroId: string, entityType: 'CLAIM' | 'CASE', entityId: string): Promise<MacroPreviewChangeDto[]> {
    const prisma = getPrismaClient();
    const macro = await prisma.macro.findUnique({ where: { id: macroId } });
    if (!macro) throw new NotFoundException('Macro not found');

    const entity = entityType === 'CLAIM' ? await prisma.claim.findUnique({ where: { id: entityId } }) : await prisma.case.findUnique({ where: { id: entityId } });
    if (!entity) throw new NotFoundException(`${entityType} ${entityId} not found`);

    const actions = Array.isArray(macro.actions) ? (macro.actions as unknown as ActionSpec[]) : [];
    return actions.map((action) => describeAction(action, entityType, entity as unknown as Record<string, unknown>));
  }

  async apply(macroId: string, entityType: 'CLAIM' | 'CASE', entityId: string, actingUserId: string): Promise<ActionExecutionResult[]> {
    const prisma = getPrismaClient();
    const macro = await prisma.macro.findUnique({ where: { id: macroId } });
    if (!macro) throw new NotFoundException('Macro not found');
    if (!macro.isActive) throw new BadRequestException('Macro is not active');
    if (macro.entityType && macro.entityType !== entityType) {
      throw new BadRequestException(`Macro "${macro.name}" is scoped to ${macro.entityType}, cannot apply to a ${entityType}`);
    }

    const entityRef: CaseManagementEntityRef = entityType === 'CLAIM' ? { entityType: 'CLAIM', claimId: entityId } : { entityType: 'CASE', caseId: entityId };
    const actions = Array.isArray(macro.actions) ? (macro.actions as unknown as ActionSpec[]) : [];
    const results = await executeActions(actions, { entity: entityRef, actingUserId, systemJobName: null });

    await prisma.macro.update({ where: { id: macroId }, data: { usageCount: { increment: 1 } } });

    return results;
  }
}
