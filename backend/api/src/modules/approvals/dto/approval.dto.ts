import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const APPROVAL_QUERY_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DECIDED'] as const;

export class ApprovalQueryDto {
  /** 'DECIDED' is a query-only shorthand for "APPROVED or REJECTED" (a History view) — never a real Approval.status value, translated in the controller. */
  @ApiProperty({ required: false, enum: APPROVAL_QUERY_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(APPROVAL_QUERY_STATUSES)
  status?: (typeof APPROVAL_QUERY_STATUSES)[number];
}

/**
 * One row from the generic `Approval` table, resolved into something a
 * unified inbox can render without the caller needing to know each
 * entityType's own shape. `linkPath` is a frontend-relative path to the
 * actual record — deciding still happens there (each entity type's own
 * approve/reject action has different side effects), this is a queue, not
 * a second decision engine. `isMine` = the caller submitted this request
 * themselves (they can track it here, but the segregation-of-duties rule
 * every entity type already enforces means they can't be the one to
 * decide it).
 */
export class PendingApprovalDto {
  @ApiProperty() id!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) reason!: string | null;
  @ApiProperty() requestedById!: string;
  @ApiProperty({ nullable: true }) requestedByName!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) linkPath!: string | null;
  @ApiProperty() isMine!: boolean;
  /** Null while status is PENDING. */
  @ApiProperty({ nullable: true }) decidedAt!: Date | null;
  @ApiProperty({ nullable: true }) decisionNote!: string | null;
  @ApiProperty({ nullable: true }) approvedByName!: string | null;
}

export class CreateApprovalDelegationDto {
  @ApiProperty({ description: 'The colleague who should also be able to decide your named-approver workflow gates while this is active.' })
  @IsUUID()
  delegateId!: string;

  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * `standsInFor` names ONLY the entityType where a delegation actually
 * changes anything (see ApprovalDelegation's own schema comment) — surfaced
 * so the frontend can say plainly "this only applies to workflow approval
 * gates" instead of implying a delegate can now decide everything the
 * delegator could.
 */
export class ApprovalDelegationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() delegatorId!: string;
  @ApiProperty({ nullable: true }) delegatorName!: string | null;
  @ApiProperty() delegateId!: string;
  @ApiProperty({ nullable: true }) delegateName!: string | null;
  @ApiProperty() startsAt!: Date;
  @ApiProperty() endsAt!: Date;
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ example: 'CASE_AUTOMATION_GATE' }) standsInFor!: string;
}

/**
 * Minimal id+name directory for the "delegate to" picker. Deliberately its
 * own tiny endpoint rather than reusing GET /identity/users: that route is
 * gated on `identity:read`, which a front-line broker role holds at no
 * scope at all (see baseline.ts's ACCOUNT_HANDLER grants) — yet a broker
 * can absolutely be a named CASE_AUTOMATION_GATE approver and need to
 * delegate. `users_rw`'s RLS is already unconditionally open to any
 * authenticated user (see that policy's own comment); this just exposes
 * the same "who exists" read without also handing out the full
 * user-management directory endpoint.
 */
export class ColleagueOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}
