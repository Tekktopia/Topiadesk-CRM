import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { getPrismaClient, Prisma, type CaseWatcher } from '@topiadesk/db';

export interface WatcherEntityRef {
  claimId?: string;
  caseId?: string;
}

/** Shared implementation behind {claims,cases}.controller.ts's watcher sub-resource — one CaseWatcher table serves both, per case_watchers_exactly_one_parent. */
@Injectable()
export class WatchersService {
  async list(entity: WatcherEntityRef): Promise<CaseWatcher[]> {
    return getPrismaClient().caseWatcher.findMany({ where: { claimId: entity.claimId, caseId: entity.caseId }, orderBy: { createdAt: 'asc' } });
  }

  async add(entity: WatcherEntityRef, userId: string): Promise<CaseWatcher> {
    try {
      return await getPrismaClient().caseWatcher.create({ data: { claimId: entity.claimId, caseId: entity.caseId, userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('User is already watching this record');
      }
      throw err;
    }
  }

  async remove(entity: WatcherEntityRef, userId: string): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.caseWatcher.findFirst({ where: { claimId: entity.claimId, caseId: entity.caseId, userId } });
    if (!existing) throw new NotFoundException('Watcher not found');
    await prisma.caseWatcher.delete({ where: { id: existing.id } });
  }
}
