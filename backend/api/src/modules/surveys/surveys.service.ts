import { randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getPrismaClient,
  runWithRlsContext,
  SYSTEM_JOB_CONTEXT,
  type Survey,
  type SurveyResponse,
  type SurveyResponseChannel,
  type SurveyTriggerEvent,
  type SurveyType,
} from '@topiadesk/db';

export interface CreateSurveyResponseOptions {
  accountId?: string;
  respondentContactId?: string;
  agentId?: string;
  channel: SurveyResponseChannel;
}

export interface SurveyResponseListFilter {
  agentId?: string;
  from?: Date;
  to?: Date;
}

export interface SurveyListFilter {
  type?: SurveyType;
  isActive?: boolean;
}

export interface CreateSurveyInput {
  name: string;
  type: SurveyType;
  triggerEvent: SurveyTriggerEvent;
  questionText: string;
  scaleMin?: number;
  scaleMax: number;
  isActive?: boolean;
  sendDelayMinutes?: number;
}

export type UpdateSurveyInput = Partial<CreateSurveyInput>;

/**
 * Not built as a controller-adjacent private helper — exported so other
 * domain modules can call it directly once they exist. Case resolution
 * (another agent's module, not built yet per the Batch 1 plan) is the
 * obvious first caller: dispatch a CSAT survey when a Case moves to
 * RESOLVED. Usage from another module:
 *
 *   // that module's *.module.ts
 *   imports: [SurveysModule]
 *
 *   // that module's service, constructor-injected
 *   constructor(private readonly surveys: SurveysService) {}
 *   await this.surveys.createSurveyResponse(surveyId, 'CASE', caseId, {
 *     accountId: case.accountId,
 *     agentId: case.assignedToId,
 *     channel: 'EMAIL',
 *   });
 *
 * SurveysModule exports SurveysService below for exactly this.
 */
@Injectable()
export class SurveysService {
  async list(filter: SurveyListFilter): Promise<Survey[]> {
    return getPrismaClient().survey.findMany({
      where: { type: filter.type, isActive: filter.isActive },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Survey> {
    const survey = await getPrismaClient().survey.findUnique({ where: { id } });
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  async create(dto: CreateSurveyInput, createdById: string): Promise<Survey> {
    return getPrismaClient().survey.create({ data: { ...dto, createdById } });
  }

  async update(id: string, dto: UpdateSurveyInput): Promise<Survey> {
    await this.findOne(id);
    return getPrismaClient().survey.update({ where: { id }, data: dto });
  }

  /**
   * dedupeKey-guarded upsert: one row per (survey, triggerEntityType,
   * triggerEntityId), per the SurveyResponse schema comment — the direct
   * fix for the cited Freshdesk gap where a revised rating leaves stale
   * data behind. A second call for the same trigger is a no-op that
   * returns the existing row rather than creating a duplicate.
   *
   * Always runs under SYSTEM_JOB_CONTEXT regardless of the caller's own
   * bound RLS context — dispatching a survey is a system action, not
   * something the calling agent's own permission scope should gate (same
   * reasoning as keycloak-webhook.controller.ts's SYSTEM_JOB_CONTEXT wrap;
   * `survey_responses_rw`'s WITH CHECK explicitly names SYSTEM_JOB as a
   * first-class writer for exactly this).
   */
  async createSurveyResponse(
    surveyId: string,
    triggerEntityType: string,
    triggerEntityId: string,
    opts: CreateSurveyResponseOptions,
  ): Promise<SurveyResponse> {
    const dedupeKey = `${surveyId}:${triggerEntityType}:${triggerEntityId}`;
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const existing = await prisma.surveyResponse.findUnique({ where: { dedupeKey } });
      if (existing) return existing;

      const respondToken = randomBytes(32).toString('hex');
      return prisma.surveyResponse.create({
        data: {
          surveyId,
          triggerEntityType,
          triggerEntityId,
          accountId: opts.accountId,
          respondentContactId: opts.respondentContactId,
          agentId: opts.agentId,
          channel: opts.channel,
          dedupeKey,
          respondToken,
          sentAt: new Date(),
        },
      });
    });
  }

  async listResponses(surveyId: string, filter: SurveyResponseListFilter): Promise<SurveyResponse[]> {
    await this.findOne(surveyId);
    return getPrismaClient().surveyResponse.findMany({
      where: {
        surveyId,
        agentId: filter.agentId,
        respondedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * The one unauthenticated-but-verified write path in this codebase —
   * see surveys.module.ts's header comment. Runs under SYSTEM_JOB_CONTEXT
   * because the caller (SurveyResponsesController.submit(), an
   * intentionally-public route excluded from RlsContextMiddleware) has no
   * bound RLS context at all — same structural reason
   * keycloak-webhook.controller.ts wraps its handler this way, and for the
   * same audit-trigger consequence: survey_responses has the generic audit
   * trigger, and audit_log's own RLS INSERT policy requires
   * app_current_role()='SYSTEM_JOB' (or a bound user) or the insert is
   * rejected outright.
   *
   * respondToken is compared with crypto.timingSafeEqual (constant-time)
   * so response latency can't leak how many leading bytes matched.
   * timingSafeEqual throws on mismatched buffer lengths rather than
   * returning false, which would otherwise let an attacker distinguish
   * "wrong length" from "wrong token" by exception vs. normal return — the
   * length check up front collapses both cases to the same "invalid"
   * outcome before timingSafeEqual is ever called.
   */
  async submitResponse(responseId: string, respondToken: string, score: number, comment: string | undefined): Promise<SurveyResponse> {
    return runWithRlsContext(SYSTEM_JOB_CONTEXT, async () => {
      const prisma = getPrismaClient();
      const response = await prisma.surveyResponse.findUnique({ where: { id: responseId }, include: { survey: true } });
      if (!response || !constantTimeEquals(response.respondToken, respondToken)) {
        throw new NotFoundException('Survey response not found or token invalid');
      }
      if (response.respondedAt) {
        throw new ConflictException('This survey response has already been submitted');
      }
      if (score < response.survey.scaleMin || score > response.survey.scaleMax) {
        throw new BadRequestException(`score must be between ${response.survey.scaleMin} and ${response.survey.scaleMax}`);
      }

      const { survey: _survey, ...updated } = await prisma.surveyResponse.update({
        where: { id: responseId },
        data: { score, comment, respondedAt: new Date() },
        include: { survey: true },
      });
      return updated;
    });
  }
}

function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(actual);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
