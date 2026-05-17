import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTING_FILES = [
  'alert-ack-token.service.ts',
  'alert-escalation-cron.service.ts',
  'alert-escalation-policies.service.ts',
  'alert-route-dead-man-cron.service.ts',
  'alert-routes.service.ts',
  'alert-routing.controller.ts',
  'alert-routing.service.ts',
  'alert-test-rate-limit.service.ts',
  'emergency-contact.controller.ts',
  'emergency-contact.service.ts',
  'quiet-hours-evaluator.ts',
];

const BANNED_PATTERNS = [
  /@anthropic/i,
  /anthropic/i,
  /openai/i,
  /AiModule/,
  /PlatformAiCopilotService/,
  /PlatformAiRecommendationService/,
  /PlatformAiActionProposalsService/,
];

describe('Platform alert routing — no AI imports', () => {
  it('keeps 5B proactive and acknowledgement paths deterministic and non-AI', () => {
    const offenders = ROUTING_FILES.flatMap((file) => {
      const text = readFileSync(join(__dirname, file), 'utf8');
      return BANNED_PATTERNS.some((pattern) => pattern.test(text)) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });
});
