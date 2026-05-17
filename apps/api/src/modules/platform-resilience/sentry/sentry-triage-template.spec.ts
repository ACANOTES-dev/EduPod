import { readFileSync } from 'fs';
import { join } from 'path';

describe('Sentry triage prompt template', () => {
  it('anchors the deployed static template to the runbook without executable wording', () => {
    const template = readFileSync(
      join(__dirname, 'templates', 'sentry-triage-prompt.template.md'),
      'utf8',
    );
    const runbook = readFileSync(
      join(process.cwd(), '../../docs/runbooks/agent-sentry-triage.md'),
      'utf8',
    );

    expect(template).toContain('<!-- prompt-template-anchor -->');
    expect(template).toContain('docs/runbooks/agent-sentry-triage.md');
    expect(template).toContain('must not execute the runbook');
    expect(template).toContain('Required Alignment Tests');
    expect(runbook).toContain('<!-- prompt-template-anchor -->');
  });
});
