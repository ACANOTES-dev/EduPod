/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

// Mock Stripe module
const mockStripeCheckoutCreate = jest.fn();
const mockStripeRefundsCreate = jest.fn();
const mockStripeWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate,
      },
    },
    refunds: {
      create: mockStripeRefundsCreate,
    },
    webhooks: {
      constructEvent: mockStripeWebhooksConstructEvent,
    },
  }));
});

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { MOCK_FACADE_PROVIDERS, TenantReadFacade } from '../../common/tests/mock-facades';
import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';
import { ApplicationConversionService } from '../admissions/application-conversion.service';
import { ApplicationStateMachineService } from '../admissions/application-state-machine.service';
import { AdmissionsFinanceBridgeService } from '../admissions/admissions-finance-bridge.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';
import { StripeService } from './stripe.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVOICE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAYMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOUSEHOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockPrisma = {
  tenantStripeConfig: {
    findUnique: jest.fn(),
  },
  invoice: {
    findFirst: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  paymentAllocation: {
    create: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  receipt: {
    create: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  application: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  admissionsPaymentEvent: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockApplicationConversionService = {
  convertToStudent: jest.fn(),
};

const mockApplicationStateMachineService = {
  markApproved: jest.fn(),
};

const mockAdmissionsFinanceBridge = {
  createFinancialRecords: jest.fn().mockResolvedValue({
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-202604-0001',
    paymentId: 'pay-1',
    invoiceTotalCents: 600000,
    paymentCents: 600000,
    balanceCents: 0,
  }),
};

const mockEncryptionService = {
  decrypt: jest.fn().mockReturnValue('sk_test_fake_key'),
};

const mockInvoicesService = {
  recalculateBalance: jest.fn(),
};

const mockReceiptsService = {
  createForPayment: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockCircuitBreaker = {
  exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
};

describe('StripeService', () => {
  let service: StripeService;
  let tenantReadFacade: Record<string, jest.Mock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StripeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: CircuitBreakerRegistry,
          useValue: mockCircuitBreaker,
        },
        {
          provide: TenantReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue({ currency_code: 'EUR' }),
          },
        },
        {
          provide: ApplicationConversionService,
          useValue: mockApplicationConversionService,
        },
        {
          provide: ApplicationStateMachineService,
          useValue: mockApplicationStateMachineService,
        },
        {
          provide: AdmissionsFinanceBridgeService,
          useValue: mockAdmissionsFinanceBridge,
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    tenantReadFacade = module.get(TenantReadFacade);
    jest.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockCircuitBreaker.exec.mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());
    mockEncryptionService.decrypt.mockReturnValue('sk_test_fake_key');
    tenantReadFacade.findById!.mockResolvedValue({ currency_code: 'EUR' });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createCheckoutSession ────────────────────────────────────────────────

  describe('StripeService — createCheckoutSession', () => {
    it('should create a checkout session for an issued invoice', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-001',
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session',
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.session_id).toBe('cs_test_123');
      expect(result.checkout_url).toBe('https://checkout.stripe.com/session');
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession(TENANT_ID, 'bad-id', {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid invoice status', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when balance is zero', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '0.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when Stripe not configured', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use success_url as checkout_url when session.url is null', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: null,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_456',
        url: null,
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.checkout_url).toBe('https://example.com/success');
    });

    it('should handle partially_paid invoice status as payable', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'partially_paid',
        balance_amount: '250.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-002',
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Jones' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/partial',
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.session_id).toBe('cs_test_789');
    });

    it('should handle overdue invoice status as payable', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'overdue',
        balance_amount: '750.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-003',
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Late Family' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_overdue',
        url: 'https://checkout.stripe.com/overdue',
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.session_id).toBe('cs_test_overdue');
    });

    it('should reject void invoice status as non-payable', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'void',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Void Family' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject paid invoice status as non-payable', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'paid',
        balance_amount: '0.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Paid Family' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── processRefund ────────────────────────────────────────────────────────

  describe('StripeService — processRefund', () => {
    it('should process a Stripe refund', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: 'pi_test_123',
      });
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockStripeRefundsCreate.mockResolvedValue({
        id: 're_test_123',
        status: 'succeeded',
      });

      const result = await service.processRefund(TENANT_ID, PAYMENT_ID, 200);

      expect(result.refund_id).toBe('re_test_123');
      expect(result.status).toBe('succeeded');
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.processRefund(TENANT_ID, 'bad-id', 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when not a Stripe payment', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'cash',
        external_event_id: null,
      });

      await expect(service.processRefund(TENANT_ID, PAYMENT_ID, 100)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException when external_event_id missing', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: null,
      });

      await expect(service.processRefund(TENANT_ID, PAYMENT_ID, 100)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should use null fallback when refund status is null', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: 'pi_test_456',
      });
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockStripeRefundsCreate.mockResolvedValue({
        id: 're_test_456',
        status: null,
      });

      const result = await service.processRefund(TENANT_ID, PAYMENT_ID, 100);

      expect(result.status).toBe('succeeded');
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────

  describe('StripeService — handleWebhook', () => {
    it('should throw BadRequestException when webhook secret missing everywhere', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(null);

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );

      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    });

    it('should throw BadRequestException when signature verification fails', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await expect(
        service.handleWebhook(TENANT_ID, Buffer.from('body'), 'bad-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle checkout.session.completed event successfully', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_test_1',
        data: {
          object: {
            id: 'cs_test_session',
            metadata: {
              tenant_id: TENANT_ID,
              invoice_id: INVOICE_ID,
              household_id: HOUSEHOLD_ID,
            },
            amount_total: 50000, // $500
            payment_intent: 'pi_test_intent',
          },
        },
      });

      // Setup for handleCheckoutCompleted
      mockPrisma.payment.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '500.00',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).toHaveBeenCalled();
    });

    it('should handle payment_intent.payment_failed event (logs warning)', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        id: 'evt_test_failed',
        data: { object: {} },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
    });

    it('should handle unknown event type gracefully', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'customer.subscription.created',
        id: 'evt_test_unknown',
        data: { object: {} },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
    });

    it('should fall back to per-tenant webhook secret when global is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_webhook_secret_encrypted: 'enc_whsec',
        encryption_key_ref: 'ref',
      });
      mockEncryptionService.decrypt.mockReturnValue('whsec_per_tenant');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'customer.subscription.created',
        id: 'evt_test_per_tenant',
        data: { object: {} },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });

      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    });

    it('should handle decryption failure for per-tenant webhook secret and throw', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_webhook_secret_encrypted: 'bad_enc',
        encryption_key_ref: 'ref',
      });
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );

      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    });

    it('should handle non-Error thrown during decryption of per-tenant webhook secret', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_webhook_secret_encrypted: 'bad_enc',
        encryption_key_ref: 'ref',
      });
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );

      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    });

    it('should handle non-Error thrown during signature verification', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw 'string signature error'; // eslint-disable-line no-throw-literal
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── handleCheckoutCompleted ──────────────────────────────────────────────

  describe('StripeService — handleCheckoutCompleted (via handleWebhook)', () => {
    function setupWebhookEvent(sessionOverrides: Record<string, unknown>) {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_test_checkout',
        data: {
          object: {
            id: 'cs_test_session',
            metadata: {
              tenant_id: TENANT_ID,
              invoice_id: INVOICE_ID,
              household_id: HOUSEHOLD_ID,
            },
            amount_total: 50000,
            payment_intent: 'pi_test_intent',
            ...sessionOverrides,
          },
        },
      });
    }

    it('should skip when invoice_id is missing in metadata', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_test_no_invoice',
        data: {
          object: {
            id: 'cs_test',
            metadata: { tenant_id: TENANT_ID, household_id: HOUSEHOLD_ID },
            amount_total: 50000,
          },
        },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should skip when household_id is missing in metadata', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_test_no_household',
        data: {
          object: {
            id: 'cs_test',
            metadata: { tenant_id: TENANT_ID, invoice_id: INVOICE_ID },
            amount_total: 50000,
          },
        },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should skip when amount_total is zero', async () => {
      setupWebhookEvent({ amount_total: 0 });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should skip when amount_total is null', async () => {
      setupWebhookEvent({ amount_total: null });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when tenant not found', async () => {
      setupWebhookEvent({});
      tenantReadFacade.findById!.mockResolvedValue(null);

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should skip duplicate payment (idempotency check)', async () => {
      setupWebhookEvent({});
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'existing-payment',
        external_event_id: 'pi_test_intent',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should handle payment_intent as object with id property', async () => {
      setupWebhookEvent({
        payment_intent: { id: 'pi_object_id', status: 'succeeded' },
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '500.00',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            external_event_id: 'pi_object_id',
          }),
        }),
      );
    });

    it('should fall back to session.id when payment_intent is null', async () => {
      setupWebhookEvent({
        payment_intent: null,
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '500.00',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            external_event_id: 'cs_test_session',
          }),
        }),
      );
    });

    it('should skip allocation when invoice not found', async () => {
      setupWebhookEvent({});
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.paymentAllocation.create).not.toHaveBeenCalled();
    });

    it('should skip allocation when invoice balance is 0', async () => {
      setupWebhookEvent({});
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '0.00',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.paymentAllocation.create).not.toHaveBeenCalled();
    });

    it('should allocate min of payment amount and invoice balance', async () => {
      // Payment is $500 but balance is only $300
      setupWebhookEvent({ amount_total: 50000 }); // $500
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-new',
        tenant_id: TENANT_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '300.00',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.paymentAllocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allocated_amount: 300,
          }),
        }),
      );
    });
  });

  // ─── createAdmissionsCheckoutSession ─────────────────────────────────────

  describe('StripeService — createAdmissionsCheckoutSession', () => {
    const APPLICATION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const PAYMENT_DEADLINE = new Date('2026-05-01T00:00:00Z');

    const READY_APPLICATION = {
      id: APPLICATION_ID,
      tenant_id: TENANT_ID,
      application_number: 'APP-0001',
      status: 'conditional_approval',
      payment_amount_cents: 700_000,
      currency_code: 'EUR',
      payment_deadline: PAYMENT_DEADLINE,
      student_first_name: 'Layla',
      student_last_name: 'Khan',
    };

    beforeEach(() => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.application.update.mockResolvedValue({});
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_admissions_1',
        url: 'https://checkout.stripe.com/admissions_1',
      });
    });

    it('creates a checkout session with server-computed amount and metadata', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(READY_APPLICATION);

      const result = await service.createAdmissionsCheckoutSession(
        TENANT_ID,
        APPLICATION_ID,
        'https://example.com/ok',
        'https://example.com/cancel',
      );

      expect(result.session_id).toBe('cs_admissions_1');
      expect(result.checkout_url).toBe('https://checkout.stripe.com/admissions_1');
      expect(result.amount_cents).toBe(700_000);
      expect(result.currency_code).toBe('EUR');

      const callArgs = mockStripeCheckoutCreate.mock.calls[0]![0];
      expect(callArgs.line_items[0].price_data.unit_amount).toBe(700_000);
      expect(callArgs.line_items[0].price_data.currency).toBe('eur');
      expect(callArgs.expires_at).toBe(Math.floor(PAYMENT_DEADLINE.getTime() / 1000));
      expect(callArgs.metadata).toEqual({
        purpose: 'admissions',
        tenant_id: TENANT_ID,
        application_id: APPLICATION_ID,
        expected_amount_cents: '700000',
      });
      expect(mockPrisma.application.update).toHaveBeenCalledWith({
        where: { id: APPLICATION_ID },
        data: { stripe_checkout_session_id: 'cs_admissions_1' },
      });
    });

    it('throws NotFoundException when application not found', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(
        service.createAdmissionsCheckoutSession(
          TENANT_ID,
          APPLICATION_ID,
          'https://example.com/ok',
          'https://example.com/cancel',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when application status is not conditional_approval', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({
        ...READY_APPLICATION,
        status: 'ready_to_admit',
      });

      await expect(
        service.createAdmissionsCheckoutSession(
          TENANT_ID,
          APPLICATION_ID,
          'https://example.com/ok',
          'https://example.com/cancel',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when payment_amount_cents is null', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({
        ...READY_APPLICATION,
        payment_amount_cents: null,
      });

      await expect(
        service.createAdmissionsCheckoutSession(
          TENANT_ID,
          APPLICATION_ID,
          'https://example.com/ok',
          'https://example.com/cancel',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when payment_deadline is null', async () => {
      mockPrisma.application.findFirst.mockResolvedValue({
        ...READY_APPLICATION,
        payment_deadline: null,
      });

      await expect(
        service.createAdmissionsCheckoutSession(
          TENANT_ID,
          APPLICATION_ID,
          'https://example.com/ok',
          'https://example.com/cancel',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('falls back to success_url when Stripe returns null url', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(READY_APPLICATION);
      mockStripeCheckoutCreate.mockResolvedValue({ id: 'cs_no_url', url: null });

      const result = await service.createAdmissionsCheckoutSession(
        TENANT_ID,
        APPLICATION_ID,
        'https://fallback.example/ok',
        'https://fallback.example/cancel',
      );

      expect(result.checkout_url).toBe('https://fallback.example/ok');
    });
  });

  // ─── handleAdmissionsCheckoutCompleted (via handleWebhook) ───────────────

  describe('StripeService — handleAdmissionsCheckoutCompleted (via handleWebhook)', () => {
    const APPLICATION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const REVIEWER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const CONDITIONAL_APPLICATION = {
      id: APPLICATION_ID,
      tenant_id: TENANT_ID,
      status: 'conditional_approval',
      payment_amount_cents: 700_000,
      reviewed_by_user_id: REVIEWER_ID,
    };

    function setupAdmissionsWebhook(overrides: {
      metadata?: Record<string, string>;
      amount_total?: number | null;
    }) {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_admissions_1',
        data: {
          object: {
            id: 'cs_admissions_1',
            amount_total: overrides.amount_total ?? 700_000,
            metadata: overrides.metadata ?? {
              purpose: 'admissions',
              tenant_id: TENANT_ID,
              application_id: APPLICATION_ID,
              expected_amount_cents: '700000',
            },
          },
        },
      });
    }

    beforeEach(() => {
      mockPrisma.admissionsPaymentEvent.findUnique.mockResolvedValue(null);
      mockPrisma.admissionsPaymentEvent.create.mockResolvedValue({});
      mockApplicationConversionService.convertToStudent.mockResolvedValue({
        student_id: 'stu-1',
        household_id: 'hh-1',
        primary_parent_id: 'p-1',
        secondary_parent_id: null,
        created: true,
      });
      mockApplicationStateMachineService.markApproved.mockResolvedValue({});
    });

    it('converts the application and marks it approved on happy path', async () => {
      setupAdmissionsWebhook({});
      mockPrisma.application.findFirst.mockResolvedValue(CONDITIONAL_APPLICATION);

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockPrisma.admissionsPaymentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripe_event_id: 'evt_admissions_1',
            status: 'succeeded',
            amount_cents: 700_000,
          }),
        }),
      );
      expect(mockApplicationConversionService.convertToStudent).toHaveBeenCalledWith(
        expect.any(Object),
        { tenantId: TENANT_ID, applicationId: APPLICATION_ID, triggerUserId: REVIEWER_ID },
      );
      expect(mockApplicationStateMachineService.markApproved).toHaveBeenCalledWith(
        TENANT_ID,
        APPLICATION_ID,
        {
          actingUserId: null,
          paymentSource: 'stripe',
          overrideRecordId: null,
        },
        expect.any(Object),
      );
    });

    it('is idempotent on duplicate stripe_event_id', async () => {
      setupAdmissionsWebhook({});
      mockPrisma.admissionsPaymentEvent.findUnique.mockResolvedValue({
        id: 'existing',
        stripe_event_id: 'evt_admissions_1',
      });

      await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(mockApplicationConversionService.convertToStudent).not.toHaveBeenCalled();
      expect(mockApplicationStateMachineService.markApproved).not.toHaveBeenCalled();
      expect(mockPrisma.admissionsPaymentEvent.create).not.toHaveBeenCalled();
    });

    it('rejects tenant mismatch between webhook and metadata', async () => {
      setupAdmissionsWebhook({
        metadata: {
          purpose: 'admissions',
          tenant_id: 'other-tenant',
          application_id: APPLICATION_ID,
          expected_amount_cents: '700000',
        },
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when metadata amount differs from application amount', async () => {
      setupAdmissionsWebhook({});
      mockPrisma.application.findFirst.mockResolvedValue({
        ...CONDITIONAL_APPLICATION,
        payment_amount_cents: 800_000,
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when stripe amount_total differs from expected', async () => {
      setupAdmissionsWebhook({ amount_total: 500_000 });
      mockPrisma.application.findFirst.mockResolvedValue(CONDITIONAL_APPLICATION);

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('records out-of-band when application no longer conditional_approval', async () => {
      setupAdmissionsWebhook({});
      mockPrisma.application.findFirst.mockResolvedValue({
        ...CONDITIONAL_APPLICATION,
        status: 'approved',
      });

      await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(mockPrisma.admissionsPaymentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'received_out_of_band',
          }),
        }),
      );
      expect(mockApplicationConversionService.convertToStudent).not.toHaveBeenCalled();
      expect(mockApplicationStateMachineService.markApproved).not.toHaveBeenCalled();
    });

    it('ignores purpose=admissions on expired sessions (cron handles revert)', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.expired',
        id: 'evt_admissions_expired',
        data: {
          object: {
            id: 'cs_admissions_expired',
            metadata: { purpose: 'admissions', application_id: APPLICATION_ID },
          },
        },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result).toEqual({ received: true });
      expect(mockApplicationConversionService.convertToStudent).not.toHaveBeenCalled();
      expect(mockApplicationStateMachineService.markApproved).not.toHaveBeenCalled();
    });

    it('routes to invoice handler when purpose metadata is absent', async () => {
      mockConfigService.get.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        id: 'evt_invoice_1',
        data: {
          object: {
            id: 'cs_invoice_1',
            metadata: {
              tenant_id: TENANT_ID,
              invoice_id: INVOICE_ID,
              household_id: HOUSEHOLD_ID,
            },
            amount_total: 50_000,
            payment_intent: 'pi_test',
          },
        },
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null);
      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay-1',
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        balance_amount: '500.00',
      });

      await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(mockApplicationConversionService.convertToStudent).not.toHaveBeenCalled();
      expect(mockPrisma.payment.create).toHaveBeenCalled();
    });
  });
});
