import { randomUUID } from 'node:crypto';
import { Controller, Get, NotFoundException, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPrismaClient, Prisma, type AuditLog } from '@topiadesk/db';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { RequirePermission } from '../../common/auth/require-permission.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { AuditExportQueryDto, AuditVerifyQueryDto } from './dto/audit-export-query.dto';
import type { AuditCheckpointDto, AuditVerifyResponseDto } from './dto/audit-verify-response.dto';
import { queryRawWithRlsContext } from './rls-raw-query.util';

const EXPORT_BATCH_SIZE = 500;

interface HashMismatchRow {
  id: bigint;
  entity_type: string;
  entity_id: string;
  stored_hash: string;
  recomputed_hash: string;
}

interface CheckpointValidityRow {
  id: string;
  checkpoint_at: Date;
  anchor_hash_valid: boolean;
}

/**
 * `audit-log` (modules/audit/) already covers plain paginated listing —
 * this controller adds the two pieces that read specifically like
 * compliance/governance tooling: a streamed bulk export, and a
 * customer-facing hash-chain verification endpoint (previously only
 * exercised inside packages/db/test/rls-and-audit.integration.test.ts).
 * Both stay under identity/audit-log/* per the build brief, a sibling
 * surface to AuditLogController's GET /audit-log rather than a
 * replacement for it.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(PermissionGuard)
@Controller('identity/audit-log')
export class AuditExportController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Recent checkpoints, newest first — populates the admin UI's checkpoint
   * picker/history and lets it default "Verify" to the fast incremental
   * path (fromCheckpointId = the most recent one) instead of always
   * rescanning from genesis. Written by backend/worker's
   * audit-checkpoint/create-checkpoint.job.ts, one row per tenant schema
   * roughly every 5 minutes — see that job's header comment.
   */
  @Get('checkpoints')
  @RequirePermission('audit_log', 'read')
  @ApiOkResponse({ type: [Object], description: 'AuditCheckpointDto[]' })
  async checkpoints(): Promise<AuditCheckpointDto[]> {
    const rows = await getPrismaClient().auditCheckpoint.findMany({
      orderBy: { checkpointAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({ id: row.id, checkpointAt: row.checkpointAt, anchorHash: row.anchorHash }));
  }

  /**
   * Streamed via the raw Express response, never materialized in memory —
   * batches of EXPORT_BATCH_SIZE rows, keyset-paginated on `id` (audit_log's
   * bigint identity PK), each batch its own RLS-scoped Prisma call. Records
   * its own AuditAction.EXPORT event after the stream completes (this is
   * EXPORT's first real caller in this codebase — confirmed via
   * `grep -rn "'EXPORT'" backend/api/src` returning nothing before this).
   */
  @Get('export')
  @RequirePermission('audit_log', 'read')
  async export(@Query() query: AuditExportQueryDto, @Res() res: Response): Promise<void> {
    const prisma = getPrismaClient();
    const hasDateFilter = query.from !== undefined || query.to !== undefined;
    const baseWhere: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      createdAt: hasDateFilter
        ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
        : undefined,
    };

    const extension = query.format === 'csv' ? 'csv' : 'ndjson';
    res.setHeader('Content-Type', query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-export.${extension}"`);

    let cursorId: bigint | undefined;
    let rowCount = 0;

    if (query.format === 'csv') {
      res.write('id,entity_type,entity_id,action,actor_user_id,actor_system_job,actor_ip,chain_lane,created_at,changed_fields\n');
    }

    for (;;) {
      const rows: AuditLog[] = await prisma.auditLog.findMany({
        where: cursorId !== undefined ? { ...baseWhere, id: { gt: cursorId } } : baseWhere,
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        res.write(query.format === 'csv' ? `${toCsvLine(row)}\n` : `${JSON.stringify(toPlainRow(row))}\n`);
      }
      rowCount += rows.length;
      cursorId = rows[rows.length - 1]!.id;
      if (rows.length < EXPORT_BATCH_SIZE) break;
    }

    res.end();

    await this.auditService.recordEvent({
      action: 'EXPORT',
      entityType: 'audit_log',
      // audit_log's own PK is bigint, not uuid — entityId here (uuid-typed
      // on AuditLog) has no natural row to point at for a bulk export, so a
      // fresh synthetic id per export call is used, same reasoning
      // org-settings.controller.ts documents for its own no-natural-id case
      // (except that one is deterministic-per-key; this one is
      // intentionally a new id per export, since each export is a distinct
      // event, not updates to one ongoing "thing").
      entityId: randomUUID(),
      changedFields: { format: query.format, from: query.from ?? null, to: query.to ?? null, entityType: query.entityType ?? null, rowCount },
    });
  }

  /**
   * Recomputes every row's own `current_hash` from its OWN already-stored
   * `prev_hash` column + its own payload fields, and compares against the
   * stored value. Deliberately does NOT reconstruct prev_hash via
   * `LAG() OVER (ORDER BY id)` — an earlier version of this endpoint did,
   * and that was a real, live-caught bug: `id` (nextval()) is allocated
   * before audit_chain_before_insert()'s per-lane `pg_advisory_xact_lock`
   * is acquired, so under concurrent writes to the SAME lane, two rows can
   * receive `id`s in one order but truly link into the chain (acquire the
   * lock, read the real prior head, commit) in the OPPOSITE order —
   * `id` ordering is not guaranteed to equal true chain order. The trigger
   * itself has no such bug (the advisory lock fully serializes writers
   * within a lane, so each row's stored `prev_hash` always correctly
   * reflects its true predecessor's real `current_hash` at insert time) —
   * only the RECONSTRUCTION of that ordering via `id` was wrong. Trusting
   * each row's own stored `prev_hash` instead sidesteps the assumption
   * entirely: `current_hash == digest(prev_hash || payload)` holds
   * regardless of `id`/commit-order divergence, so this is not just
   * simpler than the window-function version but strictly more correct.
   * Confirmed live: the old query flagged 290 "mismatches" in the
   * higher-traffic tenant (scaling with concurrent write volume — 0 in the
   * two lower-traffic tenants) that vanished entirely under this version,
   * confirming they were false positives from the ordering assumption, not
   * real tampering.
   *
   * A genuine tamper — a row's stored `current_hash` no longer matching a
   * fresh recomputation from its own `prev_hash` + payload — is still
   * caught exactly the same as before; what changed is only how the
   * "expected" hash is derived, not what counts as a mismatch. Needs no
   * window function, so (unlike the old version) the date-range filter
   * applies directly in the WHERE clause — no whole-table scan required.
   *
   * Checkpoint verification is scoped to anchor_hash self-consistency
   * (`sha256(lane_hashes::text) == anchor_hash`, computed by Postgres
   * itself in the query below, not reproduced in JS — jsonb's text-cast
   * whitespace isn't guaranteed to match JSON.stringify's byte-for-byte).
   * It does NOT additionally cross-check that lane_hashes reflects the true
   * per-lane head as of checkpoint_at — documented as a further limitation
   * of this pass, not implemented here.
   *
   * A "verify from genesis" call (no fromCheckpointId) may still surface a
   * handful of pre-existing mismatches from data written before this
   * self-consistency fix shipped, if that data itself predates any
   * algorithm change made along the way — this is a property of one-way
   * hashing (there's no way to know retroactively which historical rows
   * used an earlier version of the payload/algorithm) and does not
   * indicate ongoing risk. Once a checkpoint exists, "verify since
   * checkpoint" never re-examines rows older than it, so this class of
   * false positive can only ever show up in a genesis-to-now verify.
   */
  @Get('verify')
  @RequirePermission('audit_log', 'read')
  @ApiOkResponse({ description: 'AuditVerifyResponseDto' })
  async verify(@Query() query: AuditVerifyQueryDto): Promise<AuditVerifyResponseDto> {
    const prisma = getPrismaClient();

    let rangeStart: Date | null = null;
    let rangeEnd = new Date();

    if (query.fromCheckpointId) {
      const cp = await prisma.auditCheckpoint.findUnique({ where: { id: query.fromCheckpointId } });
      if (!cp) throw new NotFoundException('fromCheckpointId not found');
      rangeStart = cp.checkpointAt;
    }
    if (query.toCheckpointId) {
      const cp = await prisma.auditCheckpoint.findUnique({ where: { id: query.toCheckpointId } });
      if (!cp) throw new NotFoundException('toCheckpointId not found');
      rangeEnd = cp.checkpointAt;
    }

    const [mismatchRows, rowsChecked] = await Promise.all([
      queryRawWithRlsContext<HashMismatchRow>(Prisma.sql`
        SELECT id, entity_type, entity_id, current_hash AS stored_hash,
          encode(digest(
            COALESCE(prev_hash, '') || jsonb_build_object(
              'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
              'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
              'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
            )::text, 'sha256'), 'hex') AS recomputed_hash
        FROM audit_log
        WHERE (${rangeStart}::timestamptz IS NULL OR created_at > ${rangeStart}::timestamptz)
          AND created_at <= ${rangeEnd}::timestamptz
          AND current_hash <> encode(digest(
            COALESCE(prev_hash, '') || jsonb_build_object(
              'id', id, 'entity_type', entity_type, 'entity_id', entity_id, 'action', action,
              'actor_user_id', actor_user_id, 'actor_system_job', actor_system_job, 'actor_ip', actor_ip,
              'changed_fields', changed_fields, 'chain_lane', chain_lane, 'created_at', created_at
            )::text, 'sha256'), 'hex')
        ORDER BY id
        LIMIT 100
      `),
      prisma.auditLog.count({
        where: { createdAt: { gt: rangeStart ?? undefined, lte: rangeEnd } },
      }),
    ]);

    const checkpointIds = [query.fromCheckpointId, query.toCheckpointId].filter((id): id is string => Boolean(id));
    const checkpointRows =
      checkpointIds.length > 0
        ? await queryRawWithRlsContext<CheckpointValidityRow>(Prisma.sql`
            SELECT id, checkpoint_at, encode(digest(lane_hashes::text, 'sha256'), 'hex') = anchor_hash AS anchor_hash_valid
            FROM audit_checkpoints
            WHERE id = ANY(${checkpointIds}::uuid[])
          `)
        : [];

    const mismatches = mismatchRows.map((row) => ({
      id: row.id.toString(),
      entityType: row.entity_type,
      entityId: row.entity_id,
      storedHash: row.stored_hash,
      recomputedHash: row.recomputed_hash,
    }));
    const checkpoints = checkpointRows.map((row) => ({ id: row.id, checkpointAt: row.checkpoint_at, anchorHashValid: row.anchor_hash_valid }));

    return {
      rangeStart,
      rangeEnd,
      rowsChecked,
      mismatches,
      mismatchCount: mismatches.length,
      checkpoints,
      verified: mismatches.length === 0 && checkpoints.every((c) => c.anchorHashValid),
    };
  }
}

function toPlainRow(row: AuditLog): Record<string, unknown> {
  return {
    id: row.id.toString(),
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actorUserId: row.actorUserId,
    actorSystemJob: row.actorSystemJob,
    actorIp: row.actorIp,
    chainLane: row.chainLane,
    changedFields: row.changedFields,
    createdAt: row.createdAt.toISOString(),
  };
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsvLine(row: AuditLog): string {
  return [
    row.id.toString(),
    row.entityType,
    row.entityId,
    row.action,
    row.actorUserId ?? '',
    row.actorSystemJob ?? '',
    row.actorIp ?? '',
    row.chainLane,
    row.createdAt.toISOString(),
    row.changedFields,
  ]
    .map(csvField)
    .join(',');
}
