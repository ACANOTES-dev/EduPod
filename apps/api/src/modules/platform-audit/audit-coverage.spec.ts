import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const MODULES_DIR = join(__dirname, '..');

describe('Platform audit coverage', () => {
  it('requires platform mutation controllers to audit or explicitly skip', () => {
    const failures: string[] = [];
    const files = listControllerFiles(MODULES_DIR);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('@RequiresPlatformPermission')) continue;
      const mutationDecoratorCount = (source.match(/@(Post|Patch|Delete)\(/g) ?? []).length;
      if (mutationDecoratorCount === 0) continue;

      const skipCount = (source.match(/@SkipPlatformAudit\(/g) ?? []).length;
      const importsAudit = source.includes('PlatformAuditService');
      const delegatesAudit =
        source.includes('auditContextFromRequest') ||
        source.includes('platformAuditService.log') ||
        source.includes('PlatformAuditService') ||
        source.includes('PlatformErrorLogService');

      if (!importsAudit && !delegatesAudit && skipCount < mutationDecoratorCount) {
        failures.push(relative(MODULES_DIR, file));
      }
    }

    expect(failures).toEqual([]);
  });
});

function listControllerFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listControllerFiles(path));
      continue;
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      files.push(path);
    }
  }

  return files;
}
