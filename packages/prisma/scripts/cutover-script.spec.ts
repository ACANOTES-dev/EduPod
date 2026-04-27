import * as fs from 'node:fs';
import * as path from 'node:path';

// Cutover docs live outside the prisma package so the user finds them
// alongside the rebuild's other artefacts. From this spec file
// (packages/prisma/scripts/) climb three levels to the repo root.
const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'communicationnew',
  'cutover',
  'production-cutover.sh',
);

describe('production-cutover.sh', () => {
  let contents: string;

  beforeAll(() => {
    contents = fs.readFileSync(SCRIPT_PATH, 'utf8');
  });

  it('exists and is readable', () => {
    expect(fs.statSync(SCRIPT_PATH).isFile()).toBe(true);
  });

  it('references the backfill scripts by name', () => {
    expect(contents).toContain('backfill-tenant-communications-configs.ts');
    expect(contents).toContain('backfill:comms-permissions');
  });

  it('contains all 11 step headers', () => {
    for (let i = 1; i <= 11; i++) {
      expect(contents).toMatch(new RegExp(`# ─── STEP ${i}\\b`));
    }
  });

  it('mentions the bypass flag check', () => {
    expect(contents).toContain('COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV');
  });

  it('references real production hostnames', () => {
    expect(contents).toContain('app.edupod.app');
    expect(contents).toContain('46.62.244.139');
  });

  it('warns "DO NOT RUN AS-IS" up front', () => {
    expect(contents).toContain('DO NOT RUN AS-IS');
  });

  it('references the verify runner with API_BASE override', () => {
    expect(contents).toContain('verify-tenant-communications-configs.ts');
    expect(contents).toContain('API_BASE=https://app.edupod.app');
  });
});
