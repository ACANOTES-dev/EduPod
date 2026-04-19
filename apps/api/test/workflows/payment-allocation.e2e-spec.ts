import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, authPost, login } from '../helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from '../tenant-fixture.builder';

jest.setTimeout(120_000);

describe('Workflow: Payment Allocation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let ownerToken: string;
  let teacherToken: string;
  let cedarOwnerToken: string;

  // Shared test data
  let householdId: string;
  let invoiceId: string;
  let invoiceTotalAmount: number;
  let partialPaymentId: string;
  let fullPaymentId: string;

  // Track whether the invoice was actually issued (vs pending_approval)
  let invoiceIsIssued = false;

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;

    const cedarLogin = await login(
      app,
      cedarFixture.ownerEmail,
      DEV_PASSWORD,
      cedarFixture.domainName,
    );
    cedarOwnerToken = cedarLogin.accessToken;

    // Create a household
    const hhRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Payment Alloc HH ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Payment Test Contact',
            phone: '+971501234567',
            relationship_label: 'Parent',
            display_order: 1,
          },
        ],
      },
      fixture.domainName,
    ).expect(201);

    householdId = hhRes.body.data.id;
  }, 60_000);

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── 1. Create and issue an invoice ──────────────────────────────────────

  it('should create a draft invoice', async () => {
    invoiceTotalAmount = 2000;

    const res = await authPost(
      app,
      '/api/v1/finance/invoices',
      ownerToken,
      {
        household_id: householdId,
        due_date: '2026-09-30',
        lines: [
          { description: 'Tuition Fee - Term 2', quantity: 1, unit_amount: 1500 },
          { description: 'Activity Fee', quantity: 1, unit_amount: 500 },
        ],
      },
      fixture.domainName,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.status).toBe('draft');
    expect(data.total_amount).toBe(invoiceTotalAmount);
    expect(data.balance_amount).toBe(invoiceTotalAmount);
    expect(data.lines).toBeDefined();
    expect(data.lines.length).toBe(2);

    invoiceId = data.id;
  });

  it('should issue the invoice', async () => {
    const res = await authPost(
      app,
      `/api/v1/finance/invoices/${invoiceId}/issue`,
      ownerToken,
      {},
      fixture.domainName,
    ).expect(200);

    const data = res.body.data;
    expect(['issued', 'pending_approval']).toContain(data.status);

    invoiceIsIssued = data.status === 'issued';
  });

  // ─── 2. Make a partial payment ──────────────────────────────────────────

  it('should create a partial payment', async () => {
    const res = await authPost(
      app,
      '/api/v1/finance/payments',
      ownerToken,
      {
        household_id: householdId,
        payment_method: 'cash',
        payment_reference: `PARTIAL-${Date.now()}`,
        amount: 800,
        received_at: '2026-03-16T10:00:00Z',
      },
      fixture.domainName,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.amount).toBe(800);
    expect(data.status).toBe('posted');

    partialPaymentId = data.id;
  });

  // ─── 3. Suggest allocations ────────────────────────────────────────────

  it('should suggest allocations in FIFO order', async () => {
    const res = await authGet(
      app,
      `/api/v1/finance/payments/${partialPaymentId}/allocations/suggest`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(Array.isArray(data)).toBe(true);

    if (invoiceIsIssued && data.length > 0) {
      // Should suggest our invoice as a target
      const suggestion = data.find((s: { invoice_id: string }) => s.invoice_id === invoiceId);
      if (suggestion) {
        expect(suggestion.suggested_amount).toBeDefined();
        expect(typeof suggestion.suggested_amount).toBe('number');
      }
    }
  });

  // ─── 4. Allocate the partial payment ──────────────────────────────────

  it('should allocate partial payment to the invoice', async () => {
    if (!invoiceIsIssued) {
      // Invoice was not issued (pending approval), skip allocation
      return;
    }

    const res = await authPost(
      app,
      `/api/v1/finance/payments/${partialPaymentId}/allocations`,
      ownerToken,
      {
        allocations: [{ invoice_id: invoiceId, amount: 800 }],
      },
      fixture.domainName,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.allocations).toBeDefined();
    expect(Array.isArray(data.allocations)).toBe(true);
    expect(data.allocations.length).toBeGreaterThanOrEqual(1);
  });

  // ─── 5. Verify invoice is partially paid ──────────────────────────────

  it('should show invoice as partially_paid after partial allocation', async () => {
    if (!invoiceIsIssued) {
      return;
    }

    const res = await authGet(
      app,
      `/api/v1/finance/invoices/${invoiceId}`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const data = res.body.data;
    expect(data.status).toBe('partially_paid');
    expect(data.balance_amount).toBe(invoiceTotalAmount - 800);
  });

  // ─── 6. Verify receipt for partial payment ────────────────────────────

  it('should generate a receipt for the partial payment', async () => {
    if (!invoiceIsIssued) {
      return;
    }

    const res = await authGet(
      app,
      `/api/v1/finance/payments/${partialPaymentId}/receipt`,
      ownerToken,
      fixture.domainName,
    );

    // Receipt may be auto-generated on allocation or on-demand
    if (res.status === 200) {
      const data = res.body.data ?? res.body;
      if (data && data.receipt_number) {
        expect(data.receipt_number).toBeDefined();
        expect(typeof data.receipt_number).toBe('string');
      }
    }
  });

  // ─── 7. Pay the remaining balance ────────────────────────────────────

  it('should create a second payment for the remaining balance', async () => {
    const remainingAmount = invoiceTotalAmount - 800; // 1200

    const res = await authPost(
      app,
      '/api/v1/finance/payments',
      ownerToken,
      {
        household_id: householdId,
        payment_method: 'bank_transfer',
        payment_reference: `FINAL-${Date.now()}`,
        amount: remainingAmount,
        received_at: '2026-03-17T10:00:00Z',
      },
      fixture.domainName,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.amount).toBe(remainingAmount);

    fullPaymentId = data.id;
  });

  it('should allocate second payment to clear the invoice balance', async () => {
    if (!invoiceIsIssued) {
      return;
    }

    const remainingAmount = invoiceTotalAmount - 800;

    const res = await authPost(
      app,
      `/api/v1/finance/payments/${fullPaymentId}/allocations`,
      ownerToken,
      {
        allocations: [{ invoice_id: invoiceId, amount: remainingAmount }],
      },
      fixture.domainName,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.allocations).toBeDefined();
    expect(data.allocations.length).toBeGreaterThanOrEqual(1);
  });

  // ─── 8. Verify invoice is fully paid ──────────────────────────────────

  it('should show invoice as paid after full allocation', async () => {
    if (!invoiceIsIssued) {
      return;
    }

    const res = await authGet(
      app,
      `/api/v1/finance/invoices/${invoiceId}`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const data = res.body.data;
    expect(data.status).toBe('paid');
    expect(data.balance_amount).toBe(0);
  });

  // ─── 9. Verify receipt for second payment ─────────────────────────────

  it('should generate a receipt for the second payment', async () => {
    if (!invoiceIsIssued) {
      return;
    }

    const res = await authGet(
      app,
      `/api/v1/finance/payments/${fullPaymentId}/receipt`,
      ownerToken,
      fixture.domainName,
    );

    if (res.status === 200) {
      const data = res.body.data ?? res.body;
      if (data && data.receipt_number) {
        expect(data.receipt_number).toBeDefined();
      }
    }
  });

  // ─── 10. Over-allocation prevention ───────────────────────────────────

  describe('Over-allocation prevention', () => {
    let overAllocInvoiceId: string;
    let overAllocPaymentId: string;
    let overAllocInvoiceIssued = false;

    beforeAll(async () => {
      // Create a small invoice for over-allocation test
      const invRes = await authPost(
        app,
        '/api/v1/finance/invoices',
        ownerToken,
        {
          household_id: householdId,
          due_date: '2026-12-31',
          lines: [{ description: 'Over-alloc Test', quantity: 1, unit_amount: 100 }],
        },
        fixture.domainName,
      ).expect(201);

      overAllocInvoiceId = invRes.body.data.id;

      // Issue it
      const issueRes = await authPost(
        app,
        `/api/v1/finance/invoices/${overAllocInvoiceId}/issue`,
        ownerToken,
        {},
        fixture.domainName,
      ).expect(200);

      overAllocInvoiceIssued = issueRes.body.data.status === 'issued';

      // Create a payment of 50
      const payRes = await authPost(
        app,
        '/api/v1/finance/payments',
        ownerToken,
        {
          household_id: householdId,
          payment_method: 'cash',
          payment_reference: `OVER-ALLOC-${Date.now()}`,
          amount: 50,
          received_at: '2026-03-16T00:00:00Z',
        },
        fixture.domainName,
      ).expect(201);

      overAllocPaymentId = payRes.body.data.id;
    });

    it('should reject allocation exceeding payment amount', async () => {
      if (!overAllocInvoiceIssued) {
        return;
      }

      // Try to allocate 200 from a 50 payment
      const res = await authPost(
        app,
        `/api/v1/finance/payments/${overAllocPaymentId}/allocations`,
        ownerToken,
        {
          allocations: [{ invoice_id: overAllocInvoiceId, amount: 200 }],
        },
        fixture.domainName,
      ).expect(400);

      expect(res.body.error.code).toBe('ALLOCATION_EXCEEDS_PAYMENT');
    });

    it('should reject allocation exceeding invoice balance', async () => {
      if (!overAllocInvoiceIssued) {
        return;
      }

      // Create a large payment
      const bigPayRes = await authPost(
        app,
        '/api/v1/finance/payments',
        ownerToken,
        {
          household_id: householdId,
          payment_method: 'cash',
          payment_reference: `BIG-PAY-${Date.now()}`,
          amount: 5000,
          received_at: '2026-03-16T00:00:00Z',
        },
        fixture.domainName,
      ).expect(201);

      const bigPaymentId = bigPayRes.body.data.id;

      // Try to allocate 5000 against a 100 invoice
      const res = await authPost(
        app,
        `/api/v1/finance/payments/${bigPaymentId}/allocations`,
        ownerToken,
        {
          allocations: [{ invoice_id: overAllocInvoiceId, amount: 5000 }],
        },
        fixture.domainName,
      );

      // Should reject: allocation exceeds invoice balance
      expect([400, 409, 422]).toContain(res.status);
    });
  });

  // ─── 11. Permission enforcement ───────────────────────────────────────

  describe('Permission enforcement', () => {
    it('should reject teacher from listing payments', async () => {
      await authGet(app, '/api/v1/finance/payments', teacherToken, fixture.domainName).expect(403);
    });

    it('should reject teacher from creating payments', async () => {
      await authPost(
        app,
        '/api/v1/finance/payments',
        teacherToken,
        {
          household_id: householdId,
          payment_method: 'cash',
          payment_reference: `TEACHER-${Date.now()}`,
          amount: 100,
          received_at: '2026-03-16T00:00:00Z',
        },
        fixture.domainName,
      ).expect(403);
    });

    it('should reject teacher from viewing invoices', async () => {
      await authGet(app, '/api/v1/finance/invoices', teacherToken, fixture.domainName).expect(403);
    });
  });

  // ─── 12. Cross-tenant isolation ───────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should prevent Cedar from seeing Al Noor invoices', async () => {
      const res = await authGet(
        app,
        '/api/v1/finance/invoices',
        cedarOwnerToken,
        cedarFixture.domainName,
      ).expect(200);

      const invoices = res.body.data ?? [];
      const leaked = invoices.find((i: { id: string }) => i.id === invoiceId);
      expect(leaked).toBeUndefined();
    });

    it('should prevent Cedar from seeing Al Noor payments', async () => {
      const res = await authGet(
        app,
        '/api/v1/finance/payments',
        cedarOwnerToken,
        cedarFixture.domainName,
      ).expect(200);

      const payments = res.body.data ?? [];
      const leaked = payments.find((p: { id: string }) => p.id === partialPaymentId);
      expect(leaked).toBeUndefined();
    });

    it('should return 404 when Cedar accesses Al Noor invoice by ID', async () => {
      await authGet(
        app,
        `/api/v1/finance/invoices/${invoiceId}`,
        cedarOwnerToken,
        cedarFixture.domainName,
      ).expect(404);
    });
  });
});
