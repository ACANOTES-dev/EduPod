import { CopilotResponsePostProcessor } from './copilot-response-post-processor';

describe('CopilotResponsePostProcessor', () => {
  it('preserves cited claims and strips uncited claims', () => {
    const processor = new CopilotResponsePostProcessor();

    const result = processor.process(
      [
        'Redis is degraded [E:health-1].',
        '',
        'The deploy caused it.',
        '',
        "I don't have evidence for user impact.",
      ].join('\n'),
      ['health-1'],
    );

    expect(result.stripped).toContain('Redis is degraded [E:health-1].');
    expect(result.stripped).not.toContain('The deploy caused it.');
    expect(result.stripped_claims_count).toBe(1);
    expect(result.citations).toEqual(['health-1']);
  });

  it('falls back to the canonical refusal when every claim is stripped', () => {
    const processor = new CopilotResponsePostProcessor();

    const result = processor.process('Redis is degraded.', []);

    expect(result.stripped).toBe("I don't have enough cited evidence to answer that.");
    expect(result.stripped_claims_count).toBe(1);
  });
});
