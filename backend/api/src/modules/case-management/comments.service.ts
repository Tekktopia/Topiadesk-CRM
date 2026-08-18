import { Injectable } from '@nestjs/common';
import { getPrismaClient, type Activity } from '@topiadesk/db';
import type { CreateCommentDto } from './dto/comment.dto';
import { satisfyCaseFirstResponseClock } from './sla-clock.util';
import { enqueueCaseCommentEmail } from './case-outbound-email.util';

export interface CommentEntityRef {
  claimId?: string;
  caseId?: string;
}

/**
 * Shared implementation behind {claims,cases}.controller.ts's
 * POST/GET :id/comments — comment/note threading reuses Activity
 * (claimId/caseId, direction: INTERNAL for internal notes) rather than a
 * new CaseComment table, per the schema's Phase 2 Case Management doc
 * comment. Injected into both controllers instead of duplicating the same
 * four lines of Prisma calls twice.
 */
@Injectable()
export class CommentsService {
  async list(entity: CommentEntityRef): Promise<Activity[]> {
    return getPrismaClient().activity.findMany({
      where: { claimId: entity.claimId, caseId: entity.caseId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  /**
   * An OUTBOUND comment on a Case is a real reply reaching the customer —
   * the first one satisfies the FIRST_RESPONSE SlaClock and stamps
   * Case.firstRespondedAt (once; a no-op on every comment after the first).
   * INTERNAL notes never count as a response, by definition. It also
   * actually emails the customer now (see case-outbound-email.util.ts) —
   * emailDeliveryStatus starts PENDING here and is advanced by the worker
   * job the enqueue below triggers.
   */
  async create(entity: CommentEntityRef, dto: CreateCommentDto, createdById: string): Promise<Activity> {
    const prisma = getPrismaClient();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const direction = dto.direction ?? 'INTERNAL';
    const isOutboundCaseEmail = Boolean(entity.caseId) && direction === 'OUTBOUND';
    const created = await prisma.activity.create({
      data: {
        claimId: entity.claimId,
        caseId: entity.caseId,
        type: dto.type ?? 'NOTE',
        direction,
        subject: dto.subject,
        body: dto.body,
        occurredAt,
        createdById,
        emailDeliveryStatus: isOutboundCaseEmail ? 'PENDING' : undefined,
        // Explicit choice only — the legacy auto-resolved-contact path
        // leaves these empty until the worker writes back what it actually
        // used (see send-case-comment-email.job.ts).
        emailTo: isOutboundCaseEmail ? (dto.emailTo ?? []) : undefined,
        emailCc: isOutboundCaseEmail ? (dto.emailCc ?? []) : undefined,
      },
    });

    if (entity.caseId && created.direction === 'OUTBOUND') {
      const kase = await prisma.case.findUnique({ where: { id: entity.caseId } });
      if (kase && !kase.firstRespondedAt) {
        await prisma.case.update({ where: { id: entity.caseId }, data: { firstRespondedAt: occurredAt } });
        await satisfyCaseFirstResponseClock(entity.caseId, occurredAt);
      }
    }

    if (isOutboundCaseEmail) {
      await enqueueCaseCommentEmail({
        activityId: created.id,
        caseId: entity.caseId!,
        to: dto.emailTo,
        cc: dto.emailCc,
      }).catch(() => undefined);
    }

    return created;
  }
}
