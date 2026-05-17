import { readFileSync } from 'fs';
import { join } from 'path';

describe('Platform AI supervised actions — no fake two-person approval', () => {
  it('keeps supervised actions on owner confirmation instead of second-account approval', () => {
    const source = readFileSync(join(__dirname, 'platform-ai-action-proposals.service.ts'), 'utf8');

    expect(source).toContain('ownerActionConfirmationService');
    expect(source).not.toMatch(/two[_-]?person/i);
    expect(source).not.toMatch(/second[_-]?approver/i);
  });
});
