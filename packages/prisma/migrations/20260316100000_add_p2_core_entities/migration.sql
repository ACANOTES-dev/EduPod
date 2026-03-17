-- CreateEnum
CREATE TYPE "HouseholdStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ParentStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('applicant', 'active', 'withdrawn', 'graduated', 'archived');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('planned', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('planned', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AcademicPeriodType" AS ENUM ('term', 'semester', 'quarter', 'custom');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('academic', 'supervision', 'duty', 'other');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ClassStaffRole" AS ENUM ('teacher', 'assistant', 'homeroom', 'substitute');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract');

-- CreateEnum
CREATE TYPE "ClassEnrolmentStatus" AS ENUM ('active', 'dropped', 'completed');

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "household_name" VARCHAR(255) NOT NULL,
    "primary_billing_parent_id" UUID,
    "address_line_1" VARCHAR(255),
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "postal_code" VARCHAR(30),
    "needs_completion" BOOLEAN NOT NULL DEFAULT false,
    "status" "HouseholdStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "contact_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "relationship_label" VARCHAR(100) NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" CITEXT,
    "phone" VARCHAR(50),
    "whatsapp_phone" VARCHAR(50),
    "preferred_contact_channels" JSONB NOT NULL,
    "relationship_label" VARCHAR(100),
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "is_billing_contact" BOOLEAN NOT NULL DEFAULT false,
    "status" "ParentStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_parents" (
    "household_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "role_label" VARCHAR(100),
    "tenant_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_parents_pkey" PRIMARY KEY ("household_id","parent_id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "student_number" VARCHAR(50),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(255),
    "first_name_ar" VARCHAR(100),
    "last_name_ar" VARCHAR(100),
    "full_name_ar" VARCHAR(255),
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender",
    "status" "StudentStatus" NOT NULL,
    "entry_date" DATE,
    "exit_date" DATE,
    "year_group_id" UUID,
    "class_homeroom_id" UUID,
    "medical_notes" TEXT,
    "has_allergy" BOOLEAN NOT NULL DEFAULT false,
    "allergy_details" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_parents" (
    "student_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "relationship_label" VARCHAR(100),
    "tenant_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("student_id","parent_id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "staff_number" VARCHAR(50),
    "job_title" VARCHAR(150),
    "employment_status" "EmploymentStatus" NOT NULL,
    "department" VARCHAR(150),
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "bank_name" VARCHAR(150),
    "bank_account_number_encrypted" TEXT,
    "bank_iban_encrypted" TEXT,
    "bank_encryption_key_ref" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "period_type" "AcademicPeriodType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicPeriodStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "next_year_group_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "year_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "subject_type" "SubjectType" NOT NULL DEFAULT 'academic',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "year_group_id" UUID,
    "subject_id" UUID,
    "homeroom_teacher_staff_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "status" "ClassStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_staff" (
    "class_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "assignment_role" "ClassStaffRole" NOT NULL,
    "tenant_id" UUID NOT NULL,

    CONSTRAINT "class_staff_pkey" PRIMARY KEY ("class_id","staff_profile_id","assignment_role")
);

-- CreateTable
CREATE TABLE "class_enrolments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "ClassEnrolmentStatus" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_households_tenant" ON "households"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_households_tenant_status" ON "households"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_emergency_contacts_household" ON "household_emergency_contacts"("tenant_id", "household_id");

-- CreateIndex
CREATE INDEX "idx_parents_tenant" ON "parents"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_parents_tenant_email" ON "parents"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "idx_parents_user" ON "parents"("user_id");

-- CreateIndex
CREATE INDEX "idx_students_tenant" ON "students"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_students_tenant_status" ON "students"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_students_tenant_household" ON "students"("tenant_id", "household_id");

-- CreateIndex
CREATE INDEX "idx_students_tenant_year_group" ON "students"("tenant_id", "year_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_staff_profiles_tenant_user" ON "staff_profiles"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_staff_profiles_tenant" ON "staff_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_staff_profiles_user" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_academic_years_tenant_name" ON "academic_years"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_academic_years_tenant" ON "academic_years"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_academic_periods_tenant_year_name" ON "academic_periods"("tenant_id", "academic_year_id", "name");

-- CreateIndex
CREATE INDEX "idx_academic_periods_tenant_year" ON "academic_periods"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_year_groups_tenant_name" ON "year_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_year_groups_tenant" ON "year_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_subjects_tenant_name" ON "subjects"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_subjects_tenant" ON "subjects"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_classes_tenant_name_year" ON "classes"("tenant_id", "name", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_classes_tenant_year" ON "classes"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_classes_tenant_status" ON "classes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_class_enrolments_tenant_class" ON "class_enrolments"("tenant_id", "class_id", "status");

-- CreateIndex
CREATE INDEX "idx_class_enrolments_tenant_student" ON "class_enrolments"("tenant_id", "student_id", "status");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_primary_billing_parent_id_fkey" FOREIGN KEY ("primary_billing_parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_emergency_contacts" ADD CONSTRAINT "household_emergency_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_emergency_contacts" ADD CONSTRAINT "household_emergency_contacts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_parents" ADD CONSTRAINT "household_parents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_parents" ADD CONSTRAINT "household_parents_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_parents" ADD CONSTRAINT "household_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_homeroom_id_fkey" FOREIGN KEY ("class_homeroom_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_groups" ADD CONSTRAINT "year_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_groups" ADD CONSTRAINT "year_groups_next_year_group_id_fkey" FOREIGN KEY ("next_year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroom_teacher_staff_id_fkey" FOREIGN KEY ("homeroom_teacher_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_staff" ADD CONSTRAINT "class_staff_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_staff" ADD CONSTRAINT "class_staff_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_staff" ADD CONSTRAINT "class_staff_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrolments" ADD CONSTRAINT "class_enrolments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrolments" ADD CONSTRAINT "class_enrolments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrolments" ADD CONSTRAINT "class_enrolments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
