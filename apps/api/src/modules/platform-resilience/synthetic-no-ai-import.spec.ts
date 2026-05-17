import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BANNED_PATTERNS = [
  /@anthropic/i,
  /anthropic/i,
  /openai/i,
  /PlatformAiCopilotService/,
  /recommendation generation/i,
  /action proposal/i,
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return filesUnder(fullPath);
    return fullPath.endsWith('.ts') && !fullPath.endsWith('.spec.ts') ? [fullPath] : [];
  });
}

describe('Platform resilience synthetic monitoring — no AI imports', () => {
  it('keeps proactive synthetic monitoring paths deterministic and non-AI', () => {
    const files = filesUnder(__dirname);
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return BANNED_PATTERNS.some((pattern) => pattern.test(text)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
