-- Phase 1: Structured additional students involved on pastoral concerns

CREATE TABLE "pastoral_concern_involved_students" (
    "concern_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_concern_involved_students_pkey" PRIMARY KEY ("concern_id","student_id")
);

ALTER TABLE "pastoral_concern_involved_students"
ADD CONSTRAINT "pastoral_concern_involved_students_concern_id_fkey"
FOREIGN KEY ("concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pastoral_concern_involved_students"
ADD CONSTRAINT "pastoral_concern_involved_students_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pastoral_concern_involved_students"
ADD CONSTRAINT "pastoral_concern_involved_students_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_pastoral_concern_involved_students_tenant_student"
ON "pastoral_concern_involved_students"("tenant_id", "student_id");
