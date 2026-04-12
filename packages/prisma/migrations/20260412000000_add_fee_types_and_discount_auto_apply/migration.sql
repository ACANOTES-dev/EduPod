-- CreateTable
CREATE TABLE "fee_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "fee_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_fee_types_tenant_name" ON "fee_types"("tenant_id", "name");
CREATE INDEX "idx_fee_types_tenant" ON "fee_types"("tenant_id");

-- AddForeignKey
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS for fee_types
ALTER TABLE "fee_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_types" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_types_tenant_isolation ON "fee_types";
CREATE POLICY fee_types_tenant_isolation ON "fee_types"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Add fee_type_id to fee_structures
ALTER TABLE "fee_structures" ADD COLUMN "fee_type_id" UUID;
CREATE INDEX "idx_fee_structures_fee_type" ON "fee_structures"("fee_type_id");
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_fee_type_id_fkey" FOREIGN KEY ("fee_type_id") REFERENCES "fee_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add auto_apply and auto_condition to discounts
ALTER TABLE "discounts" ADD COLUMN "auto_apply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "discounts" ADD COLUMN "auto_condition" JSONB;

-- Seed default fee types for each existing tenant
INSERT INTO "fee_types" (tenant_id, name, description, is_system, active)
SELECT t.id, ft.name, ft.description, true, true
FROM tenants t
CROSS JOIN (VALUES
  ('Tuition Fees', 'Core academic tuition charges'),
  ('Uniform', 'School uniform costs'),
  ('School Books', 'Textbooks and learning materials'),
  ('Transport / Bus', 'School bus or transport service fees'),
  ('School Trips', 'Excursions and field trip charges'),
  ('School Materials', 'Stationery, art supplies, and lab materials'),
  ('Registration Fee', 'One-time enrolment or registration charge'),
  ('Examination Fee', 'Exam administration and certification fees'),
  ('Technology Fee', 'Devices, software licences, and IT services'),
  ('Extra-Curricular', 'After-school clubs, sports, and activities'),
  ('Meals / Canteen', 'School meal plan or canteen charges'),
  ('Insurance', 'Student insurance or medical cover'),
  ('Graduation Fee', 'Ceremony, gown, and certificate charges'),
  ('Late Payment Penalty', 'Penalty applied for overdue balances'),
  ('Miscellaneous', 'Other charges not covered by a specific type')
) AS ft(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM fee_types WHERE fee_types.tenant_id = t.id AND fee_types.name = ft.name
);
