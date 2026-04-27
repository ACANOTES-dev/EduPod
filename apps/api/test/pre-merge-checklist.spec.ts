// Communications Overhaul — Impl 14 ships the pre-merge checklist for the user.
// Even though the rebuild merged via direct main commits (per user override of
// Rule 5), the checklist is preserved as a verification reference and as the
// template for future worktree-protocol rebuilds. These tests guarantee the
// 14 sections + production-cutover references stay intact across edits.

import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('PRE-MERGE-CHECKLIST.md completeness', () => {
  const path = resolve(__dirname, '../../../communicationnew/PRE-MERGE-CHECKLIST.md');

  it('contains all 14 required sections', async () => {
    const content = await fs.readFile(path, 'utf-8');
    const REQUIRED_SECTIONS = [
      '## 1. Rebuild Completeness',
      '## 2. Local Dev Server',
      '## 3. End-to-End Verification',
      '## 4. Architecture Documentation',
      '## 5. Coverage Thresholds',
      '## 6. Code Quality',
      '## 7. Environment Configuration',
      '## 8. Worker Cron Registration',
      '## 9. Database Schema',
      '## 10. Production Cutover Readiness',
      '## 11. Operational Layer',
      '## 12. Test Suite',
      '## 13. Merge Plan',
      '## 14. Roll-back plan',
    ];
    for (const section of REQUIRED_SECTIONS) {
      expect(content).toContain(section);
    }
  });

  it('mentions the production cutover script path', async () => {
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toContain('communicationnew/cutover/production-cutover.sh');
    expect(content).toContain('prod-tenant-credentials.json');
  });

  it('lists deferred / unchecked items as markdown checkboxes', async () => {
    const content = await fs.readFile(path, 'utf-8');
    // The user-action-required boxes (e.g. populate prod-tenant-credentials.json) stay unchecked.
    const uncheckedBoxes = content.match(/^- \[ \]/gm) ?? [];
    // Currently 5 deferred items in §10 (4) + §11 (1) + §7 (1) = 6 unchecked, but copy
    // changes might tweak the count. Floor at 3 to catch the "all-ticked-by-mistake" regression.
    expect(uncheckedBoxes.length).toBeGreaterThanOrEqual(3);
  });

  it('lists the runbooks created by Impl 10', async () => {
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toContain('comms-tenant-dispatch-failures.md');
    expect(content).toContain('comms-credential-rotation.md');
    expect(content).toContain('comms-webhook-debugging.md');
  });
});
