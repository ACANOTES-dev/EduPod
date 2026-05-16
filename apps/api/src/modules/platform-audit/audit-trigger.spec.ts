import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('platform audit append-only migration', () => {
  it('installs UPDATE and DELETE blocking triggers for platform_audit_logs', () => {
    const migrationPath = resolve(
      process.cwd(),
      '../../packages/prisma/migrations/20260516150000_add_platform_audit_error_logs/post_migrate.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION platform_audit_block_mutation()');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('BEFORE UPDATE ON platform_audit_logs');
    expect(sql).toContain('BEFORE DELETE ON platform_audit_logs');
  });
});
