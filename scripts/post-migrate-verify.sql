DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'students',
    'staff_profiles',
    'invoices',
    'notifications',
    'tenant_sequences'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = table_name
    ) THEN
      RAISE EXCEPTION 'Required table "%" is missing after migration', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND rowsecurity = true
    ) THEN
      RAISE EXCEPTION 'Required table "%" does not have RLS enabled', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
    ) THEN
      RAISE EXCEPTION 'Required table "%" does not have any RLS policies', table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pg_function_is_visible(oid)
  ) THEN
    RAISE EXCEPTION 'Required trigger function "set_updated_at" is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table IN ('students', 'staff_profiles')
  ) THEN
    RAISE EXCEPTION 'Expected updated_at triggers are missing on critical tables';
  END IF;
END
$$;
