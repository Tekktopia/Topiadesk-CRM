-- Lets multi-step workflows (approval gates, branching) run on every entity
-- type automation supports, not just tickets and claims.
--
-- AutomationRunState.entity_type is CaseManagementEntityType, which held only
-- CLAIM/CASE/LEAD. So a scheduled or event-driven rule with `steps` set could
-- not run against a policy or an opportunity — and "an opportunity above a
-- threshold needs manager sign-off" is exactly the approval a brokerage
-- wants, while "a ticket needs sign-off" is comparatively rare.
--
-- Adding members to the shared enum follows the precedent its own LEAD value
-- documents: five of the six models using it (SlaPolicy, Macro,
-- AccountSlaOverride, BusinessRule, AssignmentRule) simply gain enum members
-- with no evaluating code path, exactly as they did for LEAD. ALTER TYPE ...
-- ADD VALUE is non-blocking and cannot invalidate existing rows.

DO $$ BEGIN ALTER TYPE "CaseManagementEntityType" ADD VALUE IF NOT EXISTS 'POLICY'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CaseManagementEntityType" ADD VALUE IF NOT EXISTS 'OPPORTUNITY'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CaseManagementEntityType" ADD VALUE IF NOT EXISTS 'TASK'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CaseManagementEntityType" ADD VALUE IF NOT EXISTS 'ACCOUNT'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "CaseManagementEntityType" ADD VALUE IF NOT EXISTS 'CONTACT'; EXCEPTION WHEN others THEN NULL; END $$;
