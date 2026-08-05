-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('NOTIFIED', 'UNDER_REVIEW', 'ADJUSTED', 'SETTLED', 'REPUDIATED', 'REOPENED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('ENQUIRY', 'SERVICE_REQUEST', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW', 'OPEN', 'PENDING_CUSTOMER', 'PENDING_CARRIER', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CaseLinkType" AS ENUM ('PARENT_CHILD', 'MERGED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CaseManagementEntityType" AS ENUM ('CLAIM', 'CASE');

-- CreateEnum
CREATE TYPE "SlaMetricType" AS ENUM ('FIRST_RESPONSE', 'RESOLUTION', 'STAGE_TRANSITION');

-- CreateEnum
CREATE TYPE "SlaClockStatus" AS ENUM ('RUNNING', 'PAUSED', 'SATISFIED', 'BREACHED');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('ROUND_ROBIN', 'LOAD_BASED', 'SKILL_BASED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeArticleVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "KnowledgeFeedbackVote" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('CSAT', 'NPS', 'CES');

-- CreateEnum
CREATE TYPE "SurveyTriggerEvent" AS ENUM ('CASE_RESOLVED', 'CLAIM_SETTLED', 'POLICY_ISSUED', 'POLICY_RENEWED', 'MANUAL');

-- CreateEnum
CREATE TYPE "SurveyResponseChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PORTAL');

-- CreateEnum
CREATE TYPE "CustomFieldEntityType" AS ENUM ('ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DECIMAL', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'USER_REFERENCE', 'URL');

-- CreateEnum
CREATE TYPE "SavedViewEntityType" AS ENUM ('ACCOUNT', 'CONTACT', 'LEAD', 'OPPORTUNITY', 'TASK');

-- CreateEnum
CREATE TYPE "SavedViewVisibility" AS ENUM ('PRIVATE', 'TEAM', 'DEPARTMENT', 'ORG');

-- CreateEnum
CREATE TYPE "QuotaPeriodType" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "QuotaScopeType" AS ENUM ('USER', 'DEPARTMENT', 'BRANCH', 'ORG');

-- CreateEnum
CREATE TYPE "ScheduledReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "ScheduledReportFormat" AS ENUM ('PDF', 'EXCEL', 'CSV');

-- CreateEnum
CREATE TYPE "ScheduledReportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduledReportDeliveryChannel" AS ENUM ('EMAIL', 'IN_APP', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ScheduledReportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "CampaignAbTestMetric" AS ENUM ('OPEN_RATE', 'CLICK_RATE');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('ACCOUNT_CREATED', 'ACCOUNT_UPDATED', 'OPPORTUNITY_STAGE_CHANGED', 'POLICY_BOUND', 'POLICY_CANCELLED', 'POLICY_RENEWED', 'PREMIUM_OVERDUE', 'DOCUMENT_UPLOADED', 'TASK_COMPLETED', 'APPROVAL_DECIDED', 'CLAIM_STATUS_CHANGED', 'CASE_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXHAUSTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'SOCIAL';
ALTER TYPE "ActivityType" ADD VALUE 'LIVE_CHAT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AiFeature" ADD VALUE 'SENTIMENT_ANALYSIS';
ALTER TYPE "AiFeature" ADD VALUE 'AUTO_CATEGORIZATION';
ALTER TYPE "AiFeature" ADD VALUE 'SEMANTIC_EMBEDDING';
ALTER TYPE "AiFeature" ADD VALUE 'SEMANTIC_SEARCH';

-- AlterEnum
ALTER TYPE "ApprovalEntityType" ADD VALUE 'KNOWLEDGE_ARTICLE_PUBLISH';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'FORCE_LOGOUT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentEntityType" ADD VALUE 'CLAIM';
ALTER TYPE "DocumentEntityType" ADD VALUE 'CASE';

-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activities_created_by_id_fkey";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "ai_analyzed_at" TIMESTAMPTZ(6),
ADD COLUMN     "ai_sentiment" TEXT,
ADD COLUMN     "ai_sentiment_score" DECIMAL(4,3),
ADD COLUMN     "case_id" UUID,
ADD COLUMN     "channel_detail" TEXT,
ADD COLUMN     "claim_id" UUID,
ADD COLUMN     "created_by_system_job" TEXT,
ADD COLUMN     "external_message_id" TEXT,
ADD COLUMN     "external_thread_id" TEXT,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "case_id" UUID,
ADD COLUMN     "claim_id" UUID;

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_number" TEXT NOT NULL,
    "policy_id" UUID NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'NOTIFIED',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "date_of_loss" DATE NOT NULL,
    "date_reported" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cause_of_loss" TEXT,
    "cause_of_loss_category_id" UUID,
    "reserve_amount" DECIMAL(18,2),
    "settled_amount" DECIMAL(18,2),
    "settled_at" TIMESTAMPTZ(6),
    "repudiation_reason" TEXT,
    "adjuster_id" UUID,
    "assigned_team_id" UUID,
    "sla_policy_id" UUID,
    "catastrophe_event_id" UUID,
    "parent_claim_id" UUID,
    "external_adjuster_ref" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_id" UUID NOT NULL,
    "from_status" "ClaimStatus",
    "to_status" "ClaimStatus" NOT NULL,
    "changed_by_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catastrophe_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catastrophe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_cause_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "loss_cause_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_number" TEXT NOT NULL,
    "case_type" "CaseType" NOT NULL,
    "category_id" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "account_id" UUID,
    "contact_id" UUID,
    "policy_id" UUID,
    "assigned_to_id" UUID,
    "assigned_team_id" UUID,
    "sla_policy_id" UUID,
    "parent_case_id" UUID,
    "link_type" "CaseLinkType",
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "source_channel" "ActivityType",
    "first_responded_at" TIMESTAMPTZ(6),
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "case_type" "CaseType",

    CONSTRAINT "case_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_watchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_id" UUID,
    "case_id" UUID,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "entity_type" "CaseManagementEntityType" NOT NULL,
    "case_type" "CaseType",
    "priority" "CasePriority",
    "business_hours_calendar_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_targets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sla_policy_id" UUID NOT NULL,
    "metric_type" "SlaMetricType" NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "target_minutes" INTEGER NOT NULL,
    "escalate_after_minutes" INTEGER,
    "escalate_to_user_id" UUID,
    "escalate_to_team_id" UUID,

    CONSTRAINT "sla_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_clocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "claim_id" UUID,
    "case_id" UUID,
    "sla_target_id" UUID NOT NULL,
    "status" "SlaClockStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "paused_at" TIMESTAMPTZ(6),
    "total_paused_minutes" INTEGER NOT NULL DEFAULT 0,
    "satisfied_at" TIMESTAMPTZ(6),
    "breached_at" TIMESTAMPTZ(6),
    "escalated_at" TIMESTAMPTZ(6),

    CONSTRAINT "sla_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours_calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "weekly_hours" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "business_hours_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendar_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "business_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "macros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entity_type" "CaseManagementEntityType",
    "actions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "macros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "entity_type" "CaseManagementEntityType" NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL,
    "conditions" JSONB NOT NULL,
    "candidate_pool_team_id" UUID,
    "required_skill_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_assigned_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "skill_tag" TEXT NOT NULL,
    "proficiency" INTEGER,

    CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_category_id" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "KnowledgeArticleVisibility" NOT NULL DEFAULT 'INTERNAL',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "translation_group_id" UUID,
    "current_version_id" UUID,
    "owner_id" UUID NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "change_note" TEXT,
    "authored_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vote" "KnowledgeFeedbackVote" NOT NULL,
    "comment" TEXT,
    "case_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "SurveyType" NOT NULL,
    "trigger_event" "SurveyTriggerEvent" NOT NULL,
    "question_text" TEXT NOT NULL,
    "scale_min" INTEGER NOT NULL DEFAULT 0,
    "scale_max" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "send_delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "survey_id" UUID NOT NULL,
    "trigger_entity_type" TEXT NOT NULL,
    "trigger_entity_id" UUID NOT NULL,
    "account_id" UUID,
    "respondent_contact_id" UUID,
    "agent_id" UUID,
    "channel" "SurveyResponseChannel" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "respond_token" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "CustomFieldEntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "help_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "SavedViewEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "visibility" "SavedViewVisibility" NOT NULL DEFAULT 'PRIVATE',
    "team_id" UUID,
    "filters" JSONB NOT NULL,
    "sort" JSONB,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_quotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope_type" "QuotaScopeType" NOT NULL,
    "user_id" UUID,
    "department_id" UUID,
    "branch_id" UUID,
    "period_type" "QuotaPeriodType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "target_amount" DECIMAL(15,2) NOT NULL,
    "line_of_business" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "report_key" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "dimension" TEXT,
    "format" "ScheduledReportFormat" NOT NULL DEFAULT 'PDF',
    "frequency" "ScheduledReportFrequency" NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "hour_of_day_utc" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" UUID NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_report_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_report_id" UUID NOT NULL,
    "user_id" UUID,
    "channel" "ScheduledReportDeliveryChannel" NOT NULL DEFAULT 'EMAIL',
    "webhook_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_report_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_report_id" UUID,
    "report_key" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "dimension" TEXT,
    "format" "ScheduledReportFormat" NOT NULL,
    "status" "ScheduledReportRunStatus" NOT NULL DEFAULT 'PENDING',
    "triggered_by_id" UUID,
    "storage_key" TEXT,
    "storage_bucket" TEXT,
    "row_count" INTEGER,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_report_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "ScheduledReportDeliveryChannel" NOT NULL,
    "status" "ScheduledReportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "is_dynamic" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "subject" TEXT,
    "body_html" TEXT,
    "body_text" TEXT,
    "merge_fields" TEXT[],
    "whatsapp_template_name" TEXT,
    "whatsapp_template_lang" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "template_id" UUID,
    "segment_id" UUID,
    "scheduled_send_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "ab_test_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ab_test_sample_percent" INTEGER,
    "ab_test_metric" "CampaignAbTestMetric",
    "ab_test_winner_variant_id" UUID,
    "ab_test_decided_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "split_percent" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "variant_id" UUID,
    "channel" "CampaignChannel" NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" TEXT NOT NULL,
    "external_message_id" TEXT,
    "queued_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),
    "clicked_at" TIMESTAMPTZ(6),
    "bounced_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_suppressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID,
    "email_or_phone" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_api_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "description" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "scim_api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "event_types" "WebhookEventType"[],
    "signing_secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6),
    "response_status" INTEGER,
    "response_body_snippet" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_oauth_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connector_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_oauth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "claims_claim_number_key" ON "claims"("claim_number");

-- CreateIndex
CREATE INDEX "claims_policy_id_idx" ON "claims"("policy_id");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_adjuster_id_status_idx" ON "claims"("adjuster_id", "status");

-- CreateIndex
CREATE INDEX "claim_status_history_claim_id_created_at_idx" ON "claim_status_history"("claim_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loss_cause_categories_name_key" ON "loss_cause_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "loss_cause_categories_code_key" ON "loss_cause_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_number_key" ON "cases"("case_number");

-- CreateIndex
CREATE INDEX "cases_status_priority_idx" ON "cases"("status", "priority");

-- CreateIndex
CREATE INDEX "cases_assigned_to_id_status_idx" ON "cases"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "cases_account_id_idx" ON "cases"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_categories_name_key" ON "case_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "case_categories_code_key" ON "case_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "case_watchers_claim_id_case_id_user_id_key" ON "case_watchers"("claim_id", "case_id", "user_id");

-- CreateIndex
CREATE INDEX "sla_clocks_status_due_at_idx" ON "sla_clocks"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_holidays_calendar_id_date_key" ON "business_holidays"("calendar_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "agent_skills_user_id_skill_tag_key" ON "agent_skills"("user_id", "skill_tag");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_code_key" ON "knowledge_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_current_version_id_key" ON "knowledge_articles"("current_version_id");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_visibility_idx" ON "knowledge_articles"("status", "visibility");

-- CreateIndex
CREATE INDEX "knowledge_articles_category_id_idx" ON "knowledge_articles"("category_id");

-- CreateIndex
CREATE INDEX "knowledge_articles_translation_group_id_idx" ON "knowledge_articles"("translation_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_versions_article_id_version_number_key" ON "knowledge_article_versions"("article_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_feedback_article_id_user_id_key" ON "knowledge_article_feedback"("article_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_dedupe_key_key" ON "survey_responses"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_respond_token_key" ON "survey_responses"("respond_token");

-- CreateIndex
CREATE INDEX "survey_responses_survey_id_responded_at_idx" ON "survey_responses"("survey_id", "responded_at");

-- CreateIndex
CREATE INDEX "survey_responses_agent_id_responded_at_idx" ON "survey_responses"("agent_id", "responded_at");

-- CreateIndex
CREATE INDEX "survey_responses_trigger_entity_type_trigger_entity_id_idx" ON "survey_responses"("trigger_entity_type", "trigger_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_entity_type_key_key" ON "custom_field_definitions"("entity_type", "key");

-- CreateIndex
CREATE INDEX "saved_views_entity_type_owner_id_idx" ON "saved_views"("entity_type", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_quotas_scope_type_user_id_department_id_branch_id_per_key" ON "sales_quotas"("scope_type", "user_id", "department_id", "branch_id", "period_type", "period_start", "line_of_business");

-- CreateIndex
CREATE INDEX "scheduled_reports_next_run_at_is_active_idx" ON "scheduled_reports"("next_run_at", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_report_recipients_scheduled_report_id_user_id_cha_key" ON "scheduled_report_recipients"("scheduled_report_id", "user_id", "channel");

-- CreateIndex
CREATE INDEX "scheduled_report_runs_scheduled_report_id_created_at_idx" ON "scheduled_report_runs"("scheduled_report_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_report_deliveries_dedupe_key_key" ON "scheduled_report_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduled_send_at_idx" ON "campaigns"("status", "scheduled_send_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_variants_campaign_id_label_key" ON "campaign_variants"("campaign_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_dedupe_key_key" ON "campaign_recipients"("dedupe_key");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_contact_id_key" ON "campaign_recipients"("campaign_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_suppressions_email_or_phone_channel_key" ON "campaign_suppressions"("email_or_phone", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "scim_api_tokens_token_hash_key" ON "scim_api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "webhook_deliveries_subscription_id_created_at_idx" ON "webhook_deliveries"("subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_oauth_credentials_connector_id_provider_key" ON "integration_oauth_credentials"("connector_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "activities_external_message_id_key" ON "activities"("external_message_id");

-- CreateIndex
CREATE INDEX "activities_external_thread_id_idx" ON "activities"("external_thread_id");

-- CreateIndex
CREATE INDEX "activities_claim_id_idx" ON "activities"("claim_id");

-- CreateIndex
CREATE INDEX "activities_case_id_idx" ON "activities"("case_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_cause_of_loss_category_id_fkey" FOREIGN KEY ("cause_of_loss_category_id") REFERENCES "loss_cause_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_adjuster_id_fkey" FOREIGN KEY ("adjuster_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_assigned_team_id_fkey" FOREIGN KEY ("assigned_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_catastrophe_event_id_fkey" FOREIGN KEY ("catastrophe_event_id") REFERENCES "catastrophe_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_parent_claim_id_fkey" FOREIGN KEY ("parent_claim_id") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "case_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_team_id_fkey" FOREIGN KEY ("assigned_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_parent_case_id_fkey" FOREIGN KEY ("parent_case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_watchers" ADD CONSTRAINT "case_watchers_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_watchers" ADD CONSTRAINT "case_watchers_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_watchers" ADD CONSTRAINT "case_watchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_business_hours_calendar_id_fkey" FOREIGN KEY ("business_hours_calendar_id") REFERENCES "business_hours_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_escalate_to_user_id_fkey" FOREIGN KEY ("escalate_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_escalate_to_team_id_fkey" FOREIGN KEY ("escalate_to_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_sla_target_id_fkey" FOREIGN KEY ("sla_target_id") REFERENCES "sla_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_holidays" ADD CONSTRAINT "business_holidays_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "business_hours_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "macros" ADD CONSTRAINT "macros_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_candidate_pool_team_id_fkey" FOREIGN KEY ("candidate_pool_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_last_assigned_user_id_fkey" FOREIGN KEY ("last_assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "knowledge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "knowledge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "knowledge_article_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_authored_by_id_fkey" FOREIGN KEY ("authored_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_feedback" ADD CONSTRAINT "knowledge_article_feedback_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_feedback" ADD CONSTRAINT "knowledge_article_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotas" ADD CONSTRAINT "sales_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotas" ADD CONSTRAINT "sales_quotas_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_quotas" ADD CONSTRAINT "sales_quotas_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_recipients" ADD CONSTRAINT "scheduled_report_recipients_scheduled_report_id_fkey" FOREIGN KEY ("scheduled_report_id") REFERENCES "scheduled_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_recipients" ADD CONSTRAINT "scheduled_report_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_runs" ADD CONSTRAINT "scheduled_report_runs_scheduled_report_id_fkey" FOREIGN KEY ("scheduled_report_id") REFERENCES "scheduled_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_runs" ADD CONSTRAINT "scheduled_report_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_deliveries" ADD CONSTRAINT "scheduled_report_deliveries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "scheduled_report_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_deliveries" ADD CONSTRAINT "scheduled_report_deliveries_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "scheduled_report_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "campaign_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "audience_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_variants" ADD CONSTRAINT "campaign_variants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_variants" ADD CONSTRAINT "campaign_variants_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "campaign_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "campaign_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_suppressions" ADD CONSTRAINT "campaign_suppressions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_oauth_credentials" ADD CONSTRAINT "integration_oauth_credentials_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "integration_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

