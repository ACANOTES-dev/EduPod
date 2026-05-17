import { readFileSync } from 'fs';
import { join } from 'path';

const READINESS_FILES = [
  'readiness-alert-evaluator.service.ts',
  'readiness-score-scheduled.task.ts',
  'readiness-score.constants.ts',
  'readiness-score.controller.ts',
  'readiness-score.service.ts',
];

const BANNED_PATTERNS = [
  /@anthropic/i,
  /anthropic/i,
  /openai/i,
  /PlatformAiCopilotService/,
  /recommendation generation/i,
  /action proposal/i,
];

describe('Platform readiness score — no AI imports', () => {
  it('keeps score, snapshot, live evaluation, and alert paths deterministic', () => {
    const offenders = READINESS_FILES.flatMap((file) => {
      const text = readFileSync(join(__dirname, file), 'utf8');
      return BANNED_PATTERNS.some((pattern) => pattern.test(text)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
