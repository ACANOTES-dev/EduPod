/* eslint-disable school/no-raw-sql-outside-rls -- index-introspection test queries pg_indexes directly */
import './setup-env';

import { PrismaClient } from '@prisma/client';

/**
 * ADM-042: guard test for the `admissions_payment_events.stripe_event_id`
 * unique index. The Stripe webhook handler relies on this index to prevent
 * duplicate event processing — if the index ever gets dropped (a stray
 * migration, a manual `DROP INDEX`, anything), this test fails loudly so
 * the regression is caught in CI rather than at the next webhook spike.
 */
describe('admissions_payment_events.stripe_event_id unique index', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exists in pg_indexes with a UNIQUE constraint', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'admissions_payment_events'
        AND indexdef ILIKE '%(stripe_event_id)%'
    `;

    const uniqueIndex = rows.find((r) => r.indexdef.toUpperCase().includes('UNIQUE'));

    expect(uniqueIndex).toBeDefined();
    if (!uniqueIndex) return;
    expect(uniqueIndex.indexdef).toMatch(/UNIQUE/i);
    expect(uniqueIndex.indexdef).toMatch(/stripe_event_id/);
  });
});
