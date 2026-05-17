import { readFileSync } from 'fs';
import { join } from 'path';

describe('Platform AI recommendations — manual trigger guard', () => {
  it('does not register cron, interval, or alert-fired Anthropic generation hooks', () => {
    const source = readFileSync(join(__dirname, 'platform-ai-recommendation.service.ts'), 'utf8');

    expect(source).not.toContain('@Cron');
    expect(source).not.toContain('@Interval');
    expect(source).not.toContain('alert_fired');
    expect(source).not.toContain('OnModuleInit');
  });
});
