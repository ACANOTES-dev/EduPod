-- ─── Finance fixes migration ─────────────────────────────────────────────────
-- Accumulates data-level fixes discovered during end-to-end QA.

-- ── 1. Backfill fee_type_id on existing fee structures ─────────────────────
-- Match structure name substring to fee type name. For "TUITION 1ST CLASS"
-- the "TUITION" prefix maps to the "Tuition Fees" fee_type.

-- Disable RLS on fee_structures/fee_types to update across all tenants.
ALTER TABLE fee_structures DISABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types DISABLE ROW LEVEL SECURITY;

UPDATE fee_structures fs
SET fee_type_id = ft.id
FROM fee_types ft
WHERE fs.tenant_id = ft.tenant_id
  AND fs.fee_type_id IS NULL
  AND (
       (UPPER(fs.name) LIKE 'TUITION%' AND ft.name ILIKE 'Tuition%')
    OR (UPPER(fs.name) LIKE '%UNIFORM%' AND ft.name ILIKE 'Uniform%')
    OR (UPPER(fs.name) LIKE '%BOOK%' AND ft.name ILIKE '%Book%')
    OR (UPPER(fs.name) LIKE '%BUS%' AND ft.name ILIKE '%Transport%')
    OR (UPPER(fs.name) LIKE '%TRANSPORT%' AND ft.name ILIKE '%Transport%')
    OR (UPPER(fs.name) LIKE '%TRIP%' AND ft.name ILIKE '%Trip%')
    OR (UPPER(fs.name) LIKE '%MATERIAL%' AND ft.name ILIKE '%Material%')
    OR (UPPER(fs.name) LIKE '%REGISTRATION%' AND ft.name ILIKE '%Registration%')
    OR (UPPER(fs.name) LIKE '%EXAM%' AND ft.name ILIKE '%Exam%')
    OR (UPPER(fs.name) LIKE '%TECH%' AND ft.name ILIKE '%Technology%')
    OR (UPPER(fs.name) LIKE '%CURRICULAR%' AND ft.name ILIKE '%Extra%')
    OR (UPPER(fs.name) LIKE '%MEAL%' AND ft.name ILIKE '%Meal%')
    OR (UPPER(fs.name) LIKE '%CANTEEN%' AND ft.name ILIKE '%Meal%')
    OR (UPPER(fs.name) LIKE '%INSURANCE%' AND ft.name ILIKE '%Insurance%')
    OR (UPPER(fs.name) LIKE '%GRADUATION%' AND ft.name ILIKE '%Graduation%')
    OR (UPPER(fs.name) LIKE '%LATE%' AND ft.name ILIKE '%Late%')
  );

-- Any fee structure still without a fee_type gets linked to "Miscellaneous"
-- (which the seed created per tenant) so fee-generation can still find it.
UPDATE fee_structures fs
SET fee_type_id = ft.id
FROM fee_types ft
WHERE fs.tenant_id = ft.tenant_id
  AND fs.fee_type_id IS NULL
  AND ft.name = 'Miscellaneous';

-- Re-enable RLS.
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;
ALTER TABLE fee_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_types FORCE ROW LEVEL SECURITY;

-- ── 2. Seed credit_note sequence rows for all existing tenants ─────────────
-- SequenceService.nextNumber throws 500 when the row is missing; without this
-- every credit-note POST fails on tenants that were onboarded before the
-- credit-note feature was wired into seeding.

-- tenant_sequences has RLS FORCED on it. Disable for this migration so we can
-- insert rows across all tenants in one statement.
ALTER TABLE tenant_sequences DISABLE ROW LEVEL SECURITY;

INSERT INTO tenant_sequences (tenant_id, sequence_type, current_value)
SELECT t.id, 'credit_note', 0
FROM tenants t
ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

-- Payment plans may eventually need one too; seed defensively.
INSERT INTO tenant_sequences (tenant_id, sequence_type, current_value)
SELECT t.id, 'payment_plan', 0
FROM tenants t
ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

-- Ensure every tenant has a payment sequence row too; the Stripe backfill
-- below depends on it.
INSERT INTO tenant_sequences (tenant_id, sequence_type, current_value)
SELECT t.id, 'payment', 0
FROM tenants t
ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

-- ── 3. Backfill Stripe-style payment references to sequential PAYREF-NNNNNN ─
-- Existing tenants have payments like `STRIPE-cs_test_a1...` (80+ chars) that
-- break PDF rendering and tables. Replace with the next PAYREF sequence value
-- per tenant, atomically.

-- Disable RLS on payments for this migration too so the DO block can select
-- across tenants.
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tenant_rec RECORD;
  payment_rec RECORD;
  next_val BIGINT;
BEGIN
  FOR tenant_rec IN SELECT DISTINCT tenant_id FROM payments WHERE payment_reference LIKE 'STRIPE-cs_%'
  LOOP
    FOR payment_rec IN
      SELECT id FROM payments
      WHERE tenant_id = tenant_rec.tenant_id
        AND payment_reference LIKE 'STRIPE-cs_%'
      ORDER BY created_at ASC
    LOOP
      UPDATE tenant_sequences
      SET current_value = current_value + 1
      WHERE tenant_id = tenant_rec.tenant_id AND sequence_type = 'payment'
      RETURNING current_value INTO next_val;

      UPDATE payments
      SET payment_reference = 'PAYREF-' || LPAD(next_val::text, 6, '0')
      WHERE id = payment_rec.id;
    END LOOP;
  END LOOP;
END $$;

-- Re-enable RLS for the tables we touched.
ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
