import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';

interface CoverageViolation {
  file: string;
  reason: string;
}

function collectControllerFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectControllerFiles(fullPath));
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Module enabled guard coverage', () => {
  it('requires ModuleEnabledGuard anywhere a controller uses @ModuleEnabled', () => {
    const repoRoot = resolve(__dirname, '../../../../..');
    const modulesDir = resolve(repoRoot, 'apps/api/src/modules');
    const controllerFiles = collectControllerFiles(modulesDir);
    const violations: CoverageViolation[] = [];

    for (const filePath of controllerFiles) {
      const content = readFileSync(filePath, 'utf8');
      if (!/@ModuleEnabled\(/.test(content)) continue;

      const useGuardsMatches = content.match(/@UseGuards\(([\s\S]*?)\)/g) ?? [];
      const inUseGuards = useGuardsMatches.some((match) => /ModuleEnabledGuard/.test(match));

      if (!/ModuleEnabledGuard/.test(content)) {
        violations.push({
          file: filePath.replace(`${repoRoot}/`, ''),
          reason: 'has @ModuleEnabled but does not import ModuleEnabledGuard',
        });
      } else if (!inUseGuards) {
        violations.push({
          file: filePath.replace(`${repoRoot}/`, ''),
          reason: 'imports ModuleEnabledGuard but does not include it in @UseGuards(...)',
        });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((violation) => `  - ${violation.file}: ${violation.reason}`)
        .join('\n');
      throw new Error(
        `Module gating coverage violations (${violations.length}):\n${summary}\n\n` +
          'Every controller decorated with @ModuleEnabled must also include ' +
          'ModuleEnabledGuard in @UseGuards(...). See Module Gating/STRATEGY.md §4.2.',
      );
    }
  });

  it('keeps legally required GDPR controllers ungated and documented', () => {
    const repoRoot = resolve(__dirname, '../../../../..');
    const gdprDir = resolve(repoRoot, 'apps/api/src/modules/gdpr');
    const controllerFiles = collectControllerFiles(gdprDir);
    const violations: CoverageViolation[] = [];
    const legalRequirementComment =
      'LEGAL REQUIREMENT: this controller MUST NEVER be gated. GDPR/DPA features are legally mandatory for every tenant. See Module Gating/STRATEGY.md §5.2.';

    for (const filePath of controllerFiles) {
      const content = readFileSync(filePath, 'utf8');
      if (/@ModuleEnabled\(/.test(content)) {
        violations.push({
          file: filePath.replace(`${repoRoot}/`, ''),
          reason: 'GDPR controllers must not use @ModuleEnabled',
        });
      }
      if (!content.includes(legalRequirementComment)) {
        violations.push({
          file: filePath.replace(`${repoRoot}/`, ''),
          reason: 'missing legal-requirement ungated comment',
        });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((violation) => `  - ${violation.file}: ${violation.reason}`)
        .join('\n');
      throw new Error(
        `GDPR module-gating violations (${violations.length}):\n${summary}\n\n` +
          'GDPR/DPA controllers are core legal obligations and must remain ungated.',
      );
    }
  });

  it('keeps the compliance request controller ungated and documented', () => {
    const repoRoot = resolve(__dirname, '../../../../..');
    const controllerPath = resolve(
      repoRoot,
      'apps/api/src/modules/compliance/compliance.controller.ts',
    );
    const content = readFileSync(controllerPath, 'utf8');
    const legalRequirementComment =
      'LEGAL REQUIREMENT: this controller MUST NEVER be gated. GDPR/DPA features are legally mandatory for every tenant. See Module Gating/STRATEGY.md §5.2.';

    expect(content).toContain(legalRequirementComment);
    expect(content).not.toMatch(/@ModuleEnabled\(/);
  });
});
