DROP TRIGGER IF EXISTS set_platform_error_redaction_rules_updated_at ON platform_error_redaction_rules;
CREATE TRIGGER set_platform_error_redaction_rules_updated_at
  BEFORE UPDATE ON platform_error_redaction_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION platform_audit_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only; UPDATE/DELETE not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_audit_logs_no_update ON platform_audit_logs;
CREATE TRIGGER platform_audit_logs_no_update
  BEFORE UPDATE ON platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform_audit_block_mutation();

DROP TRIGGER IF EXISTS platform_audit_logs_no_delete ON platform_audit_logs;
CREATE TRIGGER platform_audit_logs_no_delete
  BEFORE DELETE ON platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform_audit_block_mutation();
