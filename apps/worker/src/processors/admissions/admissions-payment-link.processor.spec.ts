import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

const mockStripeCheckoutCreate = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate,
      },
    },
  })),
);

import {
  ADMISSIONS_PAYMENT_LINK_JOB,
  AdmissionsPaymentLinkProcessor,
  type AdmissionsPaymentLinkPayload,
} from './admissions-payment-link.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222';
const PARENT_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_USER_ID = '44444444-4444-4444-4444-444444444444';
const PAYMENT_DEADLINE = new Date('2026-05-01T00:00:00Z');

function buildJob(
  name: string,
  data: Partial<AdmissionsPaymentLinkPayload> = {},
): Job<AdmissionsPaymentLinkPayload> {
  return {
    data: { tenant_id: TENANT_ID, application_id: APPLICATION_ID, ...data },
    name,
  } as Job<AdmissionsPaymentLinkPayload>;
}

function buildMockPrisma(): {
  mock: PrismaClient;
  fns: {
    applicationFindFirst: jest.Mock;
    applicationUpdate: jest.Mock;
    tenantStripeConfigFindUnique: jest.Mock;
    parentFindFirst: jest.Mock;
    notificationCreate: jest.Mock;
  };
} {
  const fns = {
    applicationFindFirst: jest.fn(),
    applicationUpdate: jest.fn().mockResolvedValue({}),
    tenantStripeConfigFindUnique: jest.fn(),
    parentFindFirst: jest.fn(),
    notificationCreate: jest.fn().mockResolvedValue({}),
  };
  const mock = {
    application: {
      findFirst: fns.applicationFindFirst,
      update: fns.applicationUpdate,
    },
    tenantStripeConfig: {
      findUnique: fns.tenantStripeConfigFindUnique,
    },
    parent: {
      findFirst: fns.parentFindFirst,
    },
    notification: {
      create: fns.notificationCreate,
    },
  } as unknown as PrismaClient;
  return { mock, fns };
}

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
  submitted_by_parent_id: PARENT_ID,
};

const STUB_ENC_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

type DecryptFn = (ciphertext: string, keyRef: string) => string;

describe('AdmissionsPaymentLinkProcessor', () => {
  let processor: AdmissionsPaymentLinkProcessor;
  let prisma: PrismaClient;
  let fns: ReturnType<typeof buildMockPrisma>['fns'];
  let originalDecrypt: DecryptFn;

  beforeEach(() => {
    const built = buildMockPrisma();
    prisma = built.mock;
    fns = built.fns;

    processor = new AdmissionsPaymentLinkProcessor(prisma);

    // Stub the decrypt helper — we are not exercising AES here, only the
    // orchestration around it. The real crypto path is covered in the
    // API's EncryptionService spec and the worker's key-rotation spec.
    // Cast through unknown + an indexed shape to reach the private method.
    const bag = processor as unknown as Record<'decrypt', DecryptFn>;
    originalDecrypt = bag.decrypt;
    bag.decrypt = jest.fn().mockReturnValue('sk_test_fake');

    process.env.ENCRYPTION_KEY_V1 = STUB_ENC_KEY;
    process.env.APP_URL = 'https://tests.edupod.app';

    fns.tenantStripeConfigFindUnique.mockResolvedValue({
      stripe_secret_key_encrypted: 'enc',
      encryption_key_ref: 'v1',
    });
    fns.applicationFindFirst.mockResolvedValue(READY_APPLICATION);
    fns.parentFindFirst.mockResolvedValue({ user_id: PARENT_USER_ID });

    mockStripeCheckoutCreate.mockReset();
    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'cs_admissions_worker_1',
      url: 'https://checkout.stripe.com/worker_1',
    });
  });

  afterEach(() => {
    (processor as unknown as Record<'decrypt', DecryptFn>).decrypt = originalDecrypt;
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    await processor.process(buildJob('some:other-job'));
    expect(fns.applicationFindFirst).not.toHaveBeenCalled();
    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe session, stamps the app, and queues an email notification', async () => {
    await processor.process(buildJob(ADMISSIONS_PAYMENT_LINK_JOB));

    expect(mockStripeCheckoutCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockStripeCheckoutCreate.mock.calls[0]![0];
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(700_000);
    expect(callArgs.metadata.purpose).toBe('admissions');
    expect(callArgs.metadata.expected_amount_cents).toBe('700000');
    expect(callArgs.expires_at).toBe(Math.floor(PAYMENT_DEADLINE.getTime() / 1000));

    expect(fns.applicationUpdate).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID },
      data: { stripe_checkout_session_id: 'cs_admissions_worker_1' },
    });

    expect(fns.notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: PARENT_USER_ID,
          channel: 'email',
          template_key: 'admissions_payment_link',
          status: 'queued',
          source_entity_type: 'application',
          source_entity_id: APPLICATION_ID,
          idempotency_key: expect.stringContaining('cs_admissions_worker_1'),
        }),
      }),
    );
  });

  it('throws when payload is missing tenant_id or application_id', async () => {
    await expect(
      processor.process(
        buildJob(ADMISSIONS_PAYMENT_LINK_JOB, {
          tenant_id: '',
          application_id: APPLICATION_ID,
        }),
      ),
    ).rejects.toThrow(/missing tenant_id or application_id/);
  });

  it('skips quietly when the application has moved out of conditional_approval', async () => {
    fns.applicationFindFirst.mockResolvedValue({
      ...READY_APPLICATION,
      status: 'approved',
    });

    await processor.process(buildJob(ADMISSIONS_PAYMENT_LINK_JOB));

    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('skips when tenant has no Stripe config', async () => {
    fns.tenantStripeConfigFindUnique.mockResolvedValue(null);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_LINK_JOB));

    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('still creates the Stripe session but skips email when parent has no user account', async () => {
    fns.parentFindFirst.mockResolvedValue(null);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_LINK_JOB));

    expect(mockStripeCheckoutCreate).toHaveBeenCalledTimes(1);
    expect(fns.applicationUpdate).toHaveBeenCalled();
    expect(fns.notificationCreate).not.toHaveBeenCalled();
  });

  it('rejects when payment_amount_cents is missing', async () => {
    fns.applicationFindFirst.mockResolvedValue({
      ...READY_APPLICATION,
      payment_amount_cents: null,
    });

    await processor.process(buildJob(ADMISSIONS_PAYMENT_LINK_JOB));

    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
  });
});
