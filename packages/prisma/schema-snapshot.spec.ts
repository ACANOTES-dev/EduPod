import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Database Schema Snapshot Test
 *
 * Compares the live `schema.prisma` against the committed snapshot
 * (`schema-snapshot.prisma`). If they differ, this test fails — forcing
 * developers to explicitly update the snapshot when schema changes are
 * intentional.
 *
 * To update the snapshot after an intentional schema change:
 *   pnpm run snapshot:schema
 *   git add packages/prisma/schema-snapshot.prisma
 *
 * The snapshot file must be committed alongside every migration so that PRs
 * expose schema diffs in code review.
 */
describe('Database Schema Snapshot', () => {
  it('schema.prisma matches committed snapshot — run `pnpm run snapshot:schema` to update', () => {
    const schemaPath = join(__dirname, 'schema.prisma');
    const snapshotPath = join(__dirname, 'schema-snapshot.prisma');

    const liveSchema = readFileSync(schemaPath, 'utf-8');
    const snapshotSchema = readFileSync(snapshotPath, 'utf-8');

    if (liveSchema !== snapshotSchema) {
      const liveLines = liveSchema.split('\n');
      const snapLines = snapshotSchema.split('\n');

      // Find the first line that differs for a useful error message
      let firstDiffLine = -1;
      const maxLines = Math.max(liveLines.length, snapLines.length);
      for (let i = 0; i < maxLines; i++) {
        if (liveLines[i] !== snapLines[i]) {
          firstDiffLine = i + 1;
          break;
        }
      }

      const message =
        `Schema has changed (first diff at line ${firstDiffLine}).\n` +
        `Run \`pnpm run snapshot:schema\` to update the snapshot,\n` +
        `then commit both schema.prisma and schema-snapshot.prisma together.`;

      throw new Error(message);
    }

    expect(liveSchema).toBe(snapshotSchema);
  });

  it('snapshot file exists and is non-empty', () => {
    const snapshotPath = join(__dirname, 'schema-snapshot.prisma');
    const content = readFileSync(snapshotPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
    // Must contain at minimum the generator and datasource blocks
    expect(content).toContain('generator client');
    expect(content).toContain('datasource db');
  });
});
