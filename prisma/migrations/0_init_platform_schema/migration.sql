-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FamilyRole" AS ENUM ('OWNER', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('ILLUSTRATION', 'COVER', 'AUDIO', 'PDF', 'CHARACTER_REFERENCE', 'AVATAR');

-- CreateEnum
CREATE TYPE "BookType" AS ENUM ('CURATED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('PENDING', 'TEXT_READY', 'ILLUSTRATING', 'ILLUSTRATED', 'NARRATING', 'NARRATED', 'APPROVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('DRAFT', 'STORY_GENERATED', 'PARENT_EDITING', 'STORY_APPROVED', 'ILLUSTRATING', 'NARRATING', 'BOOK_REVIEW', 'PUBLISHED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('STORY_GENERATION', 'STORY_REWRITE', 'IMAGE_GENERATION', 'IMAGE_REGENERATION', 'IMAGE_EDIT', 'NARRATION', 'MODERATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'EDITOR');

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "FamilyRole" NOT NULL DEFAULT 'OWNER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "avatar_asset_id" UUID,
    "reading_level" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "secondary_language" TEXT,
    "narration_preferences" JSONB,
    "accessibility_preferences" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_children" INTEGER NOT NULL,
    "library_access" BOOLEAN NOT NULL DEFAULT true,
    "custom_books_allowed" BOOLEAN NOT NULL DEFAULT false,
    "custom_book_credits" INTEGER,
    "narration_allowed" BOOLEAN NOT NULL DEFAULT false,
    "premium_images_allowed" BOOLEAN NOT NULL DEFAULT false,
    "price_minor_units" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "start_date" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "subscription_id" UUID,
    "max_children" INTEGER NOT NULL,
    "library_access" BOOLEAN NOT NULL,
    "custom_books_allowed" BOOLEAN NOT NULL,
    "custom_book_credits_total" INTEGER,
    "custom_book_credits_used" INTEGER NOT NULL DEFAULT 0,
    "narration_allowed" BOOLEAN NOT NULL,
    "premium_images_allowed" BOOLEAN NOT NULL,
    "period_resets_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_bibles" (
    "id" UUID NOT NULL,
    "family_id" UUID,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "appearance" TEXT,
    "skin_tone" TEXT,
    "hair" TEXT,
    "clothing" TEXT,
    "body_characteristics" TEXT,
    "personality" TEXT,
    "cultural_context" TEXT,
    "visual_style" TEXT NOT NULL DEFAULT 'painterly',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_reference_assets" (
    "id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "pose_id" TEXT NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_reference_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "age_range_min" INTEGER,
    "age_range_max" INTEGER,
    "reading_level" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT,
    "lesson" TEXT,
    "cover_asset_id" UUID,
    "type" "BookType" NOT NULL,
    "status" "BookStatus" NOT NULL DEFAULT 'DRAFT',
    "family_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "text" TEXT,
    "illustration_asset_id" UUID,
    "narration_asset_id" UUID,
    "illustration_spec" JSONB,
    "status" "PageStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_characters" (
    "book_id" UUID NOT NULL,
    "character_id" UUID NOT NULL,
    "role" TEXT,

    CONSTRAINT "book_characters_pkey" PRIMARY KEY ("book_id","character_id")
);

-- CreateTable
CREATE TABLE "book_assignments" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "book_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "current_page" INTEGER NOT NULL DEFAULT 1,
    "completed_pages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_reading_time_seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_sessions" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "pages_read" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reading_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stories" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "child_id" UUID,
    "status" "StoryStatus" NOT NULL DEFAULT 'DRAFT',
    "brief" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_versions" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "pages_json" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "book_id" UUID,
    "page_id" UUID,
    "job_type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "input_json" JSONB,
    "result_json" JSONB,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID,
    "book_id" UUID,
    "page_id" UUID,
    "operation_type" "JobType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_units" INTEGER,
    "output_units" INTEGER,
    "estimated_cost_minor_units" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "user_id" UUID NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "family_members_family_id_user_id_key" ON "family_members"("family_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_family_id_key" ON "subscriptions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_family_id_key" ON "entitlements"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_subscription_id_key" ON "entitlements"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_reference_assets_character_id_pose_id_key" ON "character_reference_assets"("character_id", "pose_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_book_id_page_number_key" ON "pages"("book_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "book_assignments_book_id_child_id_key" ON "book_assignments"("book_id", "child_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_child_id_book_id_key" ON "reading_progress"("child_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_stories_book_id_key" ON "app_stories"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_versions_story_id_version_number_key" ON "story_versions"("story_id", "version_number");

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_avatar_asset_id_fkey" FOREIGN KEY ("avatar_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_bibles" ADD CONSTRAINT "character_bibles_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reference_assets" ADD CONSTRAINT "character_reference_assets_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character_bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_reference_assets" ADD CONSTRAINT "character_reference_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_illustration_asset_id_fkey" FOREIGN KEY ("illustration_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_narration_asset_id_fkey" FOREIGN KEY ("narration_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_characters" ADD CONSTRAINT "book_characters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_characters" ADD CONSTRAINT "book_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character_bibles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assignments" ADD CONSTRAINT "book_assignments_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assignments" ADD CONSTRAINT "book_assignments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_assignments" ADD CONSTRAINT "book_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stories" ADD CONSTRAINT "app_stories_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stories" ADD CONSTRAINT "app_stories_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stories" ADD CONSTRAINT "app_stories_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_versions" ADD CONSTRAINT "story_versions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "app_stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_versions" ADD CONSTRAINT "story_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

