-- CreateTable
CREATE TABLE "staff_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "frequency" VARCHAR(20) NOT NULL DEFAULT 'fortnightly',
    "window_opens_at" TIMESTAMPTZ NOT NULL,
    "window_closes_at" TIMESTAMPTZ NOT NULL,
    "results_released" BOOLEAN NOT NULL DEFAULT false,
    "min_response_threshold" INTEGER NOT NULL,
    "dept_drill_down_threshold" INTEGER NOT NULL,
    "moderation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" VARCHAR(20) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "survey_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_value" INTEGER,
    "answer_text" TEXT,
    "submitted_date" DATE NOT NULL,
    "moderation_status" VARCHAR(20) DEFAULT 'pending',

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_participation_tokens" (
    "survey_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "created_date" DATE NOT NULL,

    CONSTRAINT "survey_participation_tokens_pkey" PRIMARY KEY ("survey_id","token_hash")
);

-- CreateIndex
CREATE INDEX "idx_staff_surveys_tenant_status" ON "staff_surveys"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_survey_questions_survey" ON "survey_questions"("survey_id", "display_order");

-- CreateIndex
CREATE INDEX "idx_survey_responses_survey" ON "survey_responses"("survey_id");

-- CreateIndex
CREATE INDEX "idx_survey_responses_question" ON "survey_responses"("question_id");

-- AddForeignKey
ALTER TABLE "staff_surveys" ADD CONSTRAINT "staff_surveys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_surveys" ADD CONSTRAINT "staff_surveys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "staff_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "staff_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_participation_tokens" ADD CONSTRAINT "survey_participation_tokens_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "staff_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
