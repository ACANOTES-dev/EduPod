-- CreateEnum
CREATE TYPE "HomeworkType" AS ENUM ('written', 'reading', 'research', 'revision', 'project_work', 'online_activity');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "CompletionStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('daily', 'weekly', 'custom');

-- CreateTable
CREATE TABLE "homework_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID,
    "assigned_by_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "homework_type" "HomeworkType" NOT NULL,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'draft',
    "due_date" DATE NOT NULL,
    "due_time" TIME,
    "published_at" TIMESTAMPTZ,
    "copied_from_id" UUID,
    "recurrence_rule_id" UUID,
    "max_points" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "homework_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "attachment_type" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(255),
    "file_key" VARCHAR(500),
    "file_size_bytes" INTEGER,
    "mime_type" VARCHAR(100),
    "url" TEXT,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "homework_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "homework_assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "CompletionStatus" NOT NULL DEFAULT 'not_started',
    "completed_at" TIMESTAMPTZ,
    "verified_by_user_id" UUID,
    "verified_at" TIMESTAMPTZ,
    "notes" TEXT,
    "points_awarded" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "homework_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_recurrence_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" SMALLINT NOT NULL DEFAULT 1,
    "days_of_week" SMALLINT[],
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "homework_recurrence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "diary_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_parent_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_user_id" UUID NOT NULL,
    "note_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "diary_parent_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_hw_assignments_class_status" ON "homework_assignments"("tenant_id", "class_id", "status");

-- CreateIndex
CREATE INDEX "idx_hw_assignments_due_date" ON "homework_assignments"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "idx_hw_assignments_assigned_by" ON "homework_assignments"("tenant_id", "assigned_by_user_id");

-- CreateIndex
CREATE INDEX "idx_hw_assignments_year" ON "homework_assignments"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_hw_attachments_assignment" ON "homework_attachments"("tenant_id", "homework_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_hw_completion_unique" ON "homework_completions"("tenant_id", "homework_assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_hw_completions_student" ON "homework_completions"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_hw_recurrence_tenant" ON "homework_recurrence_rules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_diary_note_unique" ON "diary_notes"("tenant_id", "student_id", "note_date");

-- CreateIndex
CREATE INDEX "idx_diary_notes_student" ON "diary_notes"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_diary_parent_notes_student_date" ON "diary_parent_notes"("tenant_id", "student_id", "note_date");

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "homework_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "homework_recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_homework_assignment_id_fkey" FOREIGN KEY ("homework_assignment_id") REFERENCES "homework_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_homework_assignment_id_fkey" FOREIGN KEY ("homework_assignment_id") REFERENCES "homework_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_recurrence_rules" ADD CONSTRAINT "homework_recurrence_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_notes" ADD CONSTRAINT "diary_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_notes" ADD CONSTRAINT "diary_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_parent_notes" ADD CONSTRAINT "diary_parent_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_parent_notes" ADD CONSTRAINT "diary_parent_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_parent_notes" ADD CONSTRAINT "diary_parent_notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_parent_notes" ADD CONSTRAINT "diary_parent_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
