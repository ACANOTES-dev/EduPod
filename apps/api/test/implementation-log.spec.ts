// Communications Overhaul — Impl 14 ensures the IMPLEMENTATION_LOG.md is closed
// out properly. This spec guarantees the final REBUILD COMPLETE record lands
// and the §4 Wave Status table shows all 14 implementations as `completed`.

import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('IMPLEMENTATION_LOG.md final record', () => {
  const path = resolve(__dirname, '../../../communicationnew/IMPLEMENTATION_LOG.md');

  it('contains the [REBUILD COMPLETE] record at the bottom', async () => {
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toContain('[REBUILD COMPLETE] — Communications Overhaul');
    expect(content).toContain('Production cutover instructions');
    expect(content).toContain('Follow-ups');
    expect(content).toContain('Rollback');
  });

  it('all 14 implementations are marked completed in §4 Wave Status', async () => {
    const content = await fs.readFile(path, 'utf-8');
    // Count `\`completed\`` cell occurrences in markdown table rows. The §4 table
    // has exactly 14 implementation rows; each completed row contributes one
    // `completed` cell. Floor at 14 to account for additional uses elsewhere.
    const completedCount = (content.match(/\|\s*`completed`\s*\|/g) ?? []).length;
    expect(completedCount).toBeGreaterThanOrEqual(14);
  });

  it('contains a completion record for each of the 14 implementations', async () => {
    const content = await fs.readFile(path, 'utf-8');
    for (const n of [
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
    ]) {
      expect(content).toMatch(new RegExp(`### \\[IMPL ${n}\\]`));
    }
  });

  it('the REBUILD COMPLETE record references the standard CI deployment route', async () => {
    const content = await fs.readFile(path, 'utf-8');
    // The user override flipped the rebuild's worktree-only Rule 5 to `main` + CI.
    // This sentinel preserves that decision in the audit trail.
    expect(content).toContain('user override of Rule 5');
  });
});
