import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BANNED_PATTERNS = [/@anthropic/i, /anthropic/i, /openai/i, /PlatformAiCopilotService/];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return filesUnder(fullPath);
    return fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts') ? [fullPath] : [];
  });
}

describe('Platform backup readiness — no AI imports', () => {
  it('keeps backup capture, polling, readiness, and drill code deterministic', () => {
    const files = filesUnder(__dirname).filter(
      (file) =>
        file.includes('backup') || file.includes('replication') || file.includes('restore-drill'),
    );
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return BANNED_PATTERNS.some((pattern) => pattern.test(text)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
