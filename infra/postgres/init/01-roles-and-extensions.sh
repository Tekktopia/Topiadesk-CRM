#!/bin/sh
# =============================================================================
# TopiaDesk CRM — Postgres role/extension bootstrap.
#
# Runs ONCE, automatically, as $POSTGRES_USER (the Postgres superuser — see
# POSTGRES_SUPERUSER/POSTGRES_SUPERUSER_PASSWORD in .env.example, mapped to
# the official postgres image's own POSTGRES_USER/POSTGRES_PASSWORD env vars
# in docker-compose.yml), the standard postgres:*/pgvector:* image mechanism:
# every *.sh/*.sql file under /docker-entrypoint-initdb.d/ is executed in
# filename order, but ONLY on first container boot against an empty
# PGDATA volume (infra/postgres/data/, gitignored). Deleting that volume and
# re-creating the container re-runs this script from scratch.
#
# This creates the two-role split that makes RLS enforcement real (see
# packages/db/prisma/rls/001_enable_rls.sql for the detailed rationale):
#   - app_migrator: schema owner, used by `prisma migrate deploy`,
#     apply-sql.ts (RLS/trigger SQL), and prisma/seed.ts. Deliberately
#     CREATEDB but NOT superuser.
#   - app_runtime:  what api/worker connect as (via PgBouncer). NOBYPASSRLS,
#     NOT the table owner, DML-only (grants below), so Postgres actually
#     enforces the CREATE POLICY rules applied later by apply-sql.ts.
# Plus a separate `keycloak` database + role for Keycloak's own internal
# storage (sessions, clients, users mirror, etc.) — kept off the `app_migrator`
# schema entirely so Keycloak's Liquibase migrations can never touch
# application tables and vice versa.
#
# Idempotency: wrapped in DO blocks / IF NOT EXISTS so a manual re-run
# (e.g. via `docker compose exec postgres` during local debugging) doesn't
# blow up on "role already exists" — even though normal operation only runs
# this once per fresh volume.
# =============================================================================
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${POSTGRES_MIGRATOR_USER}') THEN
	    CREATE ROLE "${POSTGRES_MIGRATOR_USER}" LOGIN PASSWORD \$pw\$${POSTGRES_MIGRATOR_PASSWORD}\$pw\$ CREATEDB;
	  END IF;
	END
	\$\$;

	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${POSTGRES_RUNTIME_USER}') THEN
	    CREATE ROLE "${POSTGRES_RUNTIME_USER}" LOGIN PASSWORD \$pw\$${POSTGRES_RUNTIME_PASSWORD}\$pw\$ NOBYPASSRLS;
	  END IF;
	END
	\$\$;

	-- app_migrator owns the database/schema: required for CREATE TABLE (via
	-- prisma migrate deploy), ALTER TABLE ... ENABLE ROW LEVEL SECURITY,
	-- CREATE POLICY, CREATE TRIGGER (via apply-sql.ts), and seed.ts writes.
	ALTER DATABASE "${POSTGRES_DB}" OWNER TO "${POSTGRES_MIGRATOR_USER}";
	GRANT ALL ON SCHEMA public TO "${POSTGRES_MIGRATOR_USER}";
	GRANT USAGE ON SCHEMA public TO "${POSTGRES_RUNTIME_USER}";

	-- app_runtime gets DML (not DDL) on whatever app_migrator creates from now
	-- on — this is what lets `prisma migrate deploy` add new tables without a
	-- manual GRANT step ever being forgotten. Combined with RLS policies
	-- (applied separately by apply-sql.ts after every deploy), this is the
	-- full enforcement boundary: app_runtime can read/write rows, but only the
	-- ones RLS policies allow, and can never alter schema.
	ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_MIGRATOR_USER}" IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${POSTGRES_RUNTIME_USER}";
	ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_MIGRATOR_USER}" IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO "${POSTGRES_RUNTIME_USER}";

	-- Required by schema.prisma's datasource "extensions" list (pgcrypto for
	-- gen_random_uuid()/digest(), vector for pgvector embedding columns).
	-- Run as superuser so this works regardless of the extensions' "trusted"
	-- status in this Postgres version.
	CREATE EXTENSION IF NOT EXISTS pgcrypto;
	CREATE EXTENSION IF NOT EXISTS vector;

	-- Separate database + role for Keycloak's own storage — never shares the
	-- app_migrator/app_runtime roles or the topiadesk database, so Keycloak's
	-- own Liquibase-managed schema is a fully isolated failure domain.
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${KEYCLOAK_DB_USER}') THEN
	    CREATE ROLE "${KEYCLOAK_DB_USER}" LOGIN PASSWORD \$pw\$${KEYCLOAK_DB_PASSWORD}\$pw\$;
	  END IF;
	END
	\$\$;
EOSQL

# CREATE DATABASE cannot run inside the DO-block transaction above (it must
# be the only statement in its transaction), and IF NOT EXISTS isn't valid
# syntax for CREATE DATABASE — guard it with a catalog check in a separate
# psql invocation instead.
DB_EXISTS=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${KEYCLOAK_DB}'")
if [ "$DB_EXISTS" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c \
    "CREATE DATABASE \"${KEYCLOAK_DB}\" OWNER \"${KEYCLOAK_DB_USER}\";"
fi

echo "[postgres-init] app_migrator / app_runtime / ${KEYCLOAK_DB_USER} roles and ${KEYCLOAK_DB} database ready."
