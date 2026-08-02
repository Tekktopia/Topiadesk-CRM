import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@topiadesk/db';

/**
 * Maps the Prisma error codes that are routine client-facing conditions
 * (not bugs) to the HTTP exception a REST caller actually wants — P2025
 * (row missing on update/delete), P2002 (unique constraint), P2003
 * (foreign key violation, e.g. deleting a Department a User still
 * references, or granting a permission that doesn't exist). Everything else
 * is rethrown as-is for GlobalExceptionFilter to log as a real 500.
 */
export function rethrowAsHttpException(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') throw new NotFoundException('Record not found');
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(', ') : String(err.meta?.target ?? '');
      throw new ConflictException(`Unique constraint violated${target ? ` on: ${target}` : ''}`);
    }
    if (err.code === 'P2003') {
      throw new ConflictException('Operation blocked by a foreign key relationship (referenced row missing, or still referenced elsewhere)');
    }
  }
  throw err;
}
