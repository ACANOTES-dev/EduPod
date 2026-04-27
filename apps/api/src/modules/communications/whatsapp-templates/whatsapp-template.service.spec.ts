/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('twilio', () => {
  const mockCreate = jest.fn();
  const mockApprovalCreate = jest.fn();
  const mockFetch = jest.fn();
  const mockRemove = jest.fn();
  const fakeContents = jest.fn(() => ({
    fetch: mockFetch,
    remove: mockRemove,
    approvalCreate: { create: mockApprovalCreate },
  }));
  Object.assign(fakeContents, { create: mockCreate });
  const fakeClient = {
    content: { v1: { contents: fakeContents } },
  };
  return Object.assign(
    jest.fn(() => fakeClient),
    {
      __mocks: { mockCreate, mockApprovalCreate, mockFetch, mockRemove },
    },
  );
});

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  WhatsAppTemplateService,
  mapTwilioApprovalToLocalStatus,
} from './whatsapp-template.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function freshTwilioMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilioModule = require('twilio') as {
    __mocks: {
      mockCreate: jest.Mock;
      mockApprovalCreate: jest.Mock;
      mockFetch: jest.Mock;
      mockRemove: jest.Mock;
    };
  };
  Object.values(twilioModule.__mocks).forEach((m) => m.mockReset());
  return twilioModule.__mocks;
}

function build({
  decryptedConfig = {
    twilio_account_sid: 'AC',
    twilio_auth_token: 'tok',
    twilio_whatsapp_from_number: '+15550000',
  },
}: { decryptedConfig?: Record<string, string> | null } = {}) {
  const prismaInner = {
    whatsAppTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const whatsappConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(decryptedConfig) };
  const svc = new WhatsAppTemplateService(prismaInner as never, whatsappConfig as never);
  return { svc, prisma: prismaInner, whatsappConfig };
}

describe('mapTwilioApprovalToLocalStatus', () => {
  it.each([
    ['approved', 'approved'],
    ['rejected', 'rejected'],
    ['failed', 'rejected'],
    ['pending', 'submitted'],
    ['unsubmitted', 'submitted'],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(mapTwilioApprovalToLocalStatus(input)).toBe(expected);
  });
});

describe('WhatsAppTemplateService — createTemplate', () => {
  it('creates a row in pending state on first registration', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    prisma.whatsAppTemplate.create.mockResolvedValue({
      id: TEMPLATE_ID,
      template_key: 'announce',
      status: 'pending',
    });

    const row = await svc.createTemplate(TENANT, USER, {
      template_key: 'announce',
      language_code: 'en',
      category: 'utility',
      body: 'Hi {{1}}, your invoice is ready.',
    });

    expect(row.status).toBe('pending');
    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', template_key: 'announce' }),
      }),
    );
  });

  it('throws TEMPLATE_ALREADY_EXISTS for duplicates', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    await expect(
      svc.createTemplate(TENANT, USER, {
        template_key: 'announce',
        language_code: 'en',
        category: 'utility',
        body: 'Hello',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects named placeholders', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    await expect(
      svc.createTemplate(TENANT, USER, {
        template_key: 'k',
        language_code: 'en',
        category: 'utility',
        body: 'Hi {{name}}',
      }),
    ).rejects.toThrow(/positional|named/i);
  });

  it('rejects gappy placeholder positions', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    await expect(
      svc.createTemplate(TENANT, USER, {
        template_key: 'k',
        language_code: 'en',
        category: 'utility',
        body: 'Hi {{1}} {{3}}',
      }),
    ).rejects.toThrow(/sequential/i);
  });
});

describe('WhatsAppTemplateService — submitToTwilio', () => {
  it('flips pending → submitted on Twilio success', async () => {
    const mocks = freshTwilioMocks();
    mocks.mockCreate.mockResolvedValue({ sid: 'HX_test' });
    mocks.mockApprovalCreate.mockResolvedValue({});
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT,
      template_key: 'announce',
      language_code: 'en',
      category: 'utility',
      body: 'Hi {{1}}',
      status: 'pending',
    });
    prisma.whatsAppTemplate.update.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'submitted',
      twilio_template_sid: 'HX_test',
    });

    const row = await svc.submitToTwilio(TENANT, TEMPLATE_ID, USER);
    expect(row.status).toBe('submitted');
    expect(row.twilio_template_sid).toBe('HX_test');
    expect(mocks.mockCreate).toHaveBeenCalled();
    expect(mocks.mockApprovalCreate).toHaveBeenCalled();
  });

  it('rejects when row not pending', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'submitted',
      template_key: 'k',
      language_code: 'en',
      category: 'utility',
      body: 'x',
    });
    await expect(svc.submitToTwilio(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(
      /TEMPLATE_INVALID_STATE_FOR_SUBMIT|must be "pending"/,
    );
  });

  it('throws TWILIO_SUBMIT_FAILED when Twilio errors', async () => {
    const mocks = freshTwilioMocks();
    mocks.mockCreate.mockRejectedValue(Object.assign(new Error('rate limited'), { code: 20429 }));
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'pending',
      template_key: 'k',
      language_code: 'en',
      category: 'utility',
      body: 'Hi',
    });
    await expect(svc.submitToTwilio(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws WHATSAPP_NOT_CONFIGURED when no config', async () => {
    const { svc, prisma } = build({ decryptedConfig: null });
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'pending',
      template_key: 'k',
      language_code: 'en',
      category: 'utility',
      body: 'Hi',
    });
    await expect(svc.submitToTwilio(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('WhatsAppTemplateService — syncApprovalStatus', () => {
  it('flips submitted → approved when Twilio reports approved', async () => {
    const mocks = freshTwilioMocks();
    mocks.mockFetch.mockResolvedValue({
      approval_requests: [{ status: 'approved', rejection_reason: null }],
    });
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'submitted',
      template_key: 'announce',
      twilio_template_sid: 'HX_test',
      approved_at: null,
    });
    prisma.whatsAppTemplate.update.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'approved',
      approved_at: new Date(),
    });
    const row = await svc.syncApprovalStatus(TENANT, TEMPLATE_ID);
    expect(row.status).toBe('approved');
  });

  it('flips submitted → rejected with reason', async () => {
    const mocks = freshTwilioMocks();
    mocks.mockFetch.mockResolvedValue({
      approval_requests: [{ status: 'rejected', rejection_reason: 'sales pitch in body' }],
    });
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'submitted',
      template_key: 'announce',
      twilio_template_sid: 'HX_test',
      approved_at: null,
    });
    prisma.whatsAppTemplate.update.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'rejected',
      approval_message: 'sales pitch in body',
    });
    const row = await svc.syncApprovalStatus(TENANT, TEMPLATE_ID);
    expect(row.status).toBe('rejected');
  });

  it('returns row unchanged when not in submitted state (idempotent)', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'approved',
      template_key: 'announce',
      twilio_template_sid: 'HX_test',
    });
    const row = await svc.syncApprovalStatus(TENANT, TEMPLATE_ID);
    expect(row.status).toBe('approved');
    expect(prisma.whatsAppTemplate.update).not.toHaveBeenCalled();
  });
});

describe('WhatsAppTemplateService — pause/resume', () => {
  it('pause: approved → paused', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'approved',
    });
    prisma.whatsAppTemplate.update.mockResolvedValue({ id: TEMPLATE_ID, status: 'paused' });
    const row = await svc.pauseTemplate(TENANT, TEMPLATE_ID, USER);
    expect(row.status).toBe('paused');
  });

  it('pause rejects non-approved', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'pending' });
    await expect(svc.pauseTemplate(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(BadRequestException);
  });

  it('resume: paused → approved', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'paused' });
    prisma.whatsAppTemplate.update.mockResolvedValue({ id: TEMPLATE_ID, status: 'approved' });
    const row = await svc.resumeTemplate(TENANT, TEMPLATE_ID, USER);
    expect(row.status).toBe('approved');
  });

  it('resume rejects non-paused', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'approved' });
    await expect(svc.resumeTemplate(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('WhatsAppTemplateService — getApprovedByKey', () => {
  it('returns the row when status=approved', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'approved',
      twilio_template_sid: 'HX',
    });
    const row = await svc.getApprovedByKey(TENANT, 'announce', 'en');
    expect(row?.id).toBe(TEMPLATE_ID);
  });

  it('returns null when not approved (paused/pending/etc)', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    const row = await svc.getApprovedByKey(TENANT, 'announce', 'en');
    expect(row).toBeNull();
  });
});

describe('WhatsAppTemplateService — delete', () => {
  it('removes locally even when Twilio returns 404', async () => {
    const mocks = freshTwilioMocks();
    mocks.mockRemove.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      twilio_template_sid: 'HX',
    });
    prisma.whatsAppTemplate.delete.mockResolvedValue({ id: TEMPLATE_ID });
    await svc.deleteTemplate(TENANT, TEMPLATE_ID, USER);
    expect(prisma.whatsAppTemplate.delete).toHaveBeenCalled();
  });

  it('throws when row missing', async () => {
    const { svc, prisma } = build();
    prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
    await expect(svc.deleteTemplate(TENANT, TEMPLATE_ID, USER)).rejects.toThrow(NotFoundException);
  });
});
