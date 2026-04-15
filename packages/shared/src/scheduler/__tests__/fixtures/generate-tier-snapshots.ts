/**
 * Stage 9.5.2 — one-shot generator that writes tier-4/5/6 fixtures as
 * canonical JSON into ``apps/solver-py/tests/fixtures/``. Regenerate by
 * running from the repo root:
 *
 *   pnpm --filter @school/shared exec ts-node \
 *     src/scheduler/__tests__/fixtures/generate-tier-snapshots.ts
 *
 * The Python round-trip test (``test_tier_scale_roundtrip.py``) reads
 * the committed snapshots so CI doesn't need Node available. Regenerate
 * whenever the generator logic or the shared ``SolverInputV2`` schema
 * changes materially.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

import {
  buildTier4IrishSecondaryLarge,
  buildTier5MultiCampusLarge,
  buildTier6CollegeLevel,
} from './tier-4-5-6-generators';

const outDir = resolve(__dirname, '../../../../../../apps/solver-py/tests/fixtures');

const targets = [
  {
    name: 'tier-4-irish-secondary-large.seed42.json',
    payload: buildTier4IrishSecondaryLarge(42),
  },
  {
    name: 'tier-5-multi-campus-large.seed7.json',
    payload: buildTier5MultiCampusLarge(7),
  },
  {
    name: 'tier-6-college-level.seed11.json',
    payload: buildTier6CollegeLevel(11),
  },
];

for (const t of targets) {
  const path = resolve(outDir, t.name);
  // Canonical JSON: 2-space indent, sorted-by-insertion-order (JS default).
  writeFileSync(path, JSON.stringify(t.payload, null, 2) + '\n');
  const size = JSON.stringify(t.payload).length;
  // eslint-disable-next-line no-console
  console.log(`wrote ${t.name} (${size.toLocaleString()} bytes serialised)`);
}
