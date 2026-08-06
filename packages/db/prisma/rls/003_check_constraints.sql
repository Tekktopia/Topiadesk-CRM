-- Cross-column constraints Prisma's schema DSL cannot express. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_exactly_one_parent'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_exactly_one_parent
      CHECK (num_nonnulls(account_id, carrier_id) = 1);
  END IF;

  -- Segregation of duties: an approver cannot decide their own request.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_requester_ne_approver'
  ) THEN
    ALTER TABLE approvals
      ADD CONSTRAINT approvals_requester_ne_approver
      CHECK (approved_by_id IS NULL OR approved_by_id <> requested_by_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approvals_decided_fields_consistent'
  ) THEN
    ALTER TABLE approvals
      ADD CONSTRAINT approvals_decided_fields_consistent
      CHECK (
        (status = 'PENDING' AND approved_by_id IS NULL AND decided_at IS NULL)
        OR (status <> 'PENDING' AND approved_by_id IS NOT NULL AND decided_at IS NOT NULL)
      );
  END IF;

  -- Phase 2: lets a background worker be the "author" of an inbound
  -- webhook-ingested Activity (see activities_rw in 002_policies.sql) —
  -- same one-of pair shape as AuditLog's actor columns. Widened in Phase 6
  -- to a three-way exactly-one-of (num_nonnulls, same function
  -- contacts_exactly_one_parent above already uses) so a customer-portal
  -- Contact can also be the author (createdByContactId) — caught via live
  -- testing: the original 2-column XOR rejected every portal case reply
  -- with a "violates check constraint" 500, since neither of the original
  -- two columns is set when a Contact is the actor. Unconditionally
  -- dropped first because the old 2-column definition would otherwise
  -- survive forever under this same constraint name (the IF NOT EXISTS
  -- guard only stops a first-time add, not a redefinition).
  ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_actor_xor;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_actor_xor'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_actor_xor
      CHECK (num_nonnulls(created_by_id, created_by_system_job, created_by_contact_id) = 1);
  END IF;

  -- Phase 2: Claim/Case share cross-cutting tables via a Contact-style
  -- dual-nullable-FK — a closed two-type set, so this follows Contact's
  -- pattern rather than DocumentLink's open-ended polymorphism.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_watchers_exactly_one_parent'
  ) THEN
    ALTER TABLE case_watchers
      ADD CONSTRAINT case_watchers_exactly_one_parent
      CHECK (num_nonnulls(claim_id, case_id) = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sla_clocks_exactly_one_parent'
  ) THEN
    ALTER TABLE sla_clocks
      ADD CONSTRAINT sla_clocks_exactly_one_parent
      CHECK (num_nonnulls(claim_id, case_id) = 1);
  END IF;

  -- Phase 2: exactly one of userId/departmentId/branchId set, matching
  -- scopeType — territory reuses Department/Branch rather than a new
  -- Territory entity.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_quotas_scope_target_consistent'
  ) THEN
    ALTER TABLE sales_quotas
      ADD CONSTRAINT sales_quotas_scope_target_consistent
      CHECK (
        (scope_type = 'USER' AND num_nonnulls(user_id, department_id, branch_id) = 1 AND user_id IS NOT NULL)
        OR (scope_type = 'DEPARTMENT' AND num_nonnulls(user_id, department_id, branch_id) = 1 AND department_id IS NOT NULL)
        OR (scope_type = 'BRANCH' AND num_nonnulls(user_id, department_id, branch_id) = 1 AND branch_id IS NOT NULL)
        OR (scope_type = 'ORG' AND num_nonnulls(user_id, department_id, branch_id) = 0)
      );
  END IF;
END $$;
