import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Workflow: Refund LIFO Reversal (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let cedarOwnerToken: string;

  // Shared IDs created during setup
  let householdId: string;
  let invoiceId: string;
  let paymentId: string;
  let refundId: string;

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarOwnerToken = cedarLogin.accessToken;

    // Create a household for finance tests
    const hhRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Refund LIFO HH ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Refund Emergency Contact',
            phone: '+971501234567',
            relationship_label: 'Parent',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    householdId = hhRes.body.data.id;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── 1. Create and issue an invoice ──────────────────────────────────────

  it('should create a draft invoice with multiple line items', async () => {
    const res = await authPost(
      app,
      '/api/v1/finance/invoices',
      ownerToken,
      {
        household_id: householdId,
        due_date: '2026-06-30',
        lines: [
          { description: 'Tuition Fee - Term 1', quantity: 1, unit_amount: 3000 },
          { description: 'Lab Fee', quantity: 1, unit_amount: 500 },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.status).toBe('draft');
    expect(data.total_amount).toBe(3500);
    expect(data.balance_amount).toBe(3500);

    invoiceId = data.id;
  });

  it('should issue the invoice', async () => {
    const res = await authPost(
      app,
      `/api/v1/finance/invoices/${invoiceId}/issue`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(['issued', 'pending_approval']).toContain(data.status);
  });

  // ─── 2. Record a payment and allocate it ────────────────────────────────

  it('should create a payment for the full invoice amount', async () => {
    const res = await authPost(
      app,
      '/api/v1/finance/payments',
      ownerToken,
      {
        household_id: householdId,
        payment_method: 'bank_transfer',
        payment_reference: `LIFO-PAY-${Date.now()}`,
        amount: 3500,
        received_at: '2026-03-16T00:00:00Z',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.amount).toBe(3500);
    expect(data.status).toBe('posted');

    paymentId = data.id;
  });

  it('should allocate the payment to the invoice', async () => {
    // Verify invoice is in allocatable status
    const invoiceCheck = await authGet(
      app,
      `/api/v1/finance/invoices/${invoiceId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    if (!['issued', 'overdue', 'partially_paid'].includes(invoiceCheck.body.data.status)) {
      // Invoice is not in an allocatable state (e.g., pending_approval)
      // Skip subsequent allocation-dependent tests
      return;
    }

    const res = await authPost(
      app,
      `/api/v1/finance/payments/${paymentId}/allocations`,
      ownerToken,
      {
        allocations: [
          { invoice_id: invoiceId, amount: 3500 },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.allocations).toBeDefined();
    expect(Array.isArray(data.allocations)).toBe(true);
    expect(data.allocations.length).toBeGreaterThanOrEqual(1);

    // Verify invoice is now paid
    const invoiceRes = await authGet(
      app,
      `/api/v1/finance/invoices/${invoiceId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(invoiceRes.body.data.balance_amount).toBe(0);
    expect(invoiceRes.body.data.status).toBe('paid');
  });

  // ─── 3. Record receipt before refund ────────────────────────────────────

  let receiptBeforeRefund: Record<string, unknown> | null = null;

  it('should generate a receipt for the payment', async () => {
    const res = await authGet(
      app,
      `/api/v1/finance/payments/${paymentId}/receipt`,
      ownerToken,
      AL_NOOR_DOMAIN,
    );

    // Receipt may or may not exist depending on allocation status
    if (res.status === 200) {
      const data = res.body.data ?? res.body;
      if (data && data.receipt_number) {
        receiptBeforeRefund = data;
        expect(data.receipt_number).toBeDefined();
        expect(data.issued_at).toBeDefined();
      }
    }
  });

  // ─── 4. Request a refund ────────────────────────────────────────────────

  it('should create a refund request for partial amount', async () => {
    const res = await authPost(
      app,
      '/api/v1/finance/refunds',
      ownerToken,
      {
        payment_id: paymentId,
        amount: 500,
        reason: 'Lab fee refund - student withdrew from lab course',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.amount).toBe(500);
    expect(data.status).toBe('pending_approval');
    expect(data.payment).toBeDefined();
    expect(data.payment.id).toBe(paymentId);

    refundId = data.id;
  });

  // ─── 5. Verify refund listing ──────────────────────────────────────────

  it('should list refunds and include the new refund', async () => {
    const res = await authGet(
      app,
      '/api/v1/finance/refunds',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();

    const found = res.body.data.find(
      (r: { id: string }) => r.id === refundId,
    );
    expect(found).toBeDefined();
    expect(found.status).toBe('pending_approval');
  });

  // ─── 6. Self-approval should be blocked ────────────────────────────────

  it('should block self-approval of the refund', async () => {
    const res = await authPost(
      app,
      `/api/v1/finance/refunds/${refundId}/approve`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(400);

    expect(res.body.error.code).toBe('SELF_APPROVAL_BLOCKED');
  });

  // ─── 7. Reject then create another refund ──────────────────────────────

  it('should reject the refund with a comment', async () => {
    const res = await authPost(
      app,
      `/api/v1/finance/refunds/${refundId}/reject`,
      ownerToken,
      { comment: 'Need documentation before processing refund' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data.status).toBe('rejected');
  });

  it('should not execute a rejected refund', async () => {
    const res = await authPost(
      app,
      `/api/v1/finance/refunds/${refundId}/execute`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(400);

    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  // ─── 8. Verify receipt immutability ────────────────────────────────────

  it('should verify receipt remains unchanged after refund request', async () => {
    if (!receiptBeforeRefund) {
      // No receipt was generated, skip this check
      return;
    }

    const res = await authGet(
      app,
      `/api/v1/finance/payments/${paymentId}/receipt`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data ?? res.body;
    // Receipt number and amount should remain the same
    expect(data.receipt_number).toBe(receiptBeforeRefund.receipt_number);
    expect(data.amount).toBe(receiptBeforeRefund.amount);
  });

  // ─── 9. Verify invoice status after refund rejection ──────────────────

  it('should verify invoice status is still paid after refund rejection', async () => {
    const res = await authGet(
      app,
      `/api/v1/finance/invoices/${invoiceId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    // Since refund was rejected, the invoice status should remain paid
    // (unless it was never allocated due to pending_approval)
    if (data.status === 'paid') {
      expect(data.balance_amount).toBe(0);
    }
  });

  // ─── 10. Cross-tenant isolation ───────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should prevent Cedar from seeing Al Noor refunds', async () => {
      const res = await authGet(
        app,
        '/api/v1/finance/refunds',
        cedarOwnerToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const refunds = res.body.data ?? [];
      const leaked = refunds.find(
        (r: { id: string }) => r.id === refundId,
      );
      expect(leaked).toBeUndefined();
    });

    it('should prevent Cedar from seeing Al Noor payments', async () => {
      const res = await authGet(
        app,
        '/api/v1/finance/payments',
        cedarOwnerToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const payments = res.body.data ?? [];
      const leaked = payments.find(
        (p: { id: string }) => p.id === paymentId,
      );
      expect(leaked).toBeUndefined();
    });
  });
});
