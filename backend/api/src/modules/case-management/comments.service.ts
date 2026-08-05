import { Injectable } from '@nestjs/common';
import { getPrismaClient, type Activity } from '@topiadesk/db';
import type { CreateCommentDto } from './dto/comment.dto';
import { satisfyCaseFirstResponseClock } from './sla-clock.util';

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
   * INTERNAL notes never count as a response, by definition.
   */
  async create(entity: CommentEntityRef, dto: CreateCommentDto, createdById: string): Promise<Activity> {
    const prisma = getPrismaClient();
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const created = await prisma.activity.create({
      data: {
        claimId: entity.claimId,
        caseId: entity.caseId,
        type: dto.type ?? 'NOTE',
        direction: dto.direction ?? 'INTERNAL',
        subject: dto.subject,
        body: dto.body,
        occurredAt,
        createdById,
      },
    });

    if (entity.caseId && created.direction === 'OUTBOUND') {
      const kase = await prisma.case.findUnique({ where: { id: entity.caseId } });
      if (kase && !kase.firstRespondedAt) {
        await prisma.case.update({ where: { id: entity.caseId }, data: { firstRespondedAt: occurredAt } });
        await satisfyCaseFirstResponseClock(entity.caseId, occurredAt);
      }
    }

    return created;
  }
}
