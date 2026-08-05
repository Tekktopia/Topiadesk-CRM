-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Deduplication (CRM enhancements) — trigram similarity search backing the
-- POSSIBLE match tier in accounts/contacts/leads "check-duplicates"
-- endpoints. GIN trigram indexes on normalized-name expressions, not plain
-- columns: Contact/Lead have no single "name" column, and Prisma's schema
-- DSL cannot express a functional/expression index at all (same category as
-- RLS/triggers — hand-written SQL, tracked here as a real migration rather
-- than prisma/rls/ because it's an actual schema object, not a policy).
CREATE INDEX IF NOT EXISTS accounts_name_trgm_idx ON accounts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contacts_full_name_trgm_idx ON contacts USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS leads_full_name_trgm_idx ON leads USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
