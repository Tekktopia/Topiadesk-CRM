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
END $$;
