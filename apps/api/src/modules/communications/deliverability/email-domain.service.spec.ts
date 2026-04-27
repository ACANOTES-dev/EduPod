/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('resend', () => {
  const mockCreate = jest.fn();
  const mockGet = jest.fn();
  const mockRemove = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({
      domains: { create: mockCreate, get: mockGet, remove: mockRemove },
      __mocks: { mockCreate, mockGet, mockRemove },
    })),
    __mocks: { mockCreate, mockGet, mockRemove },
  };
});

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { EMAIL_DOMAIN_NOTIFIER } from './email-domain-notifier.token';
import { EmailDomainService } from './email-domain.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOMAIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function freshMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resendModule = require('resend') as {
    __mocks: { mockCreate: jest.Mock; mockGet: jest.Mock; mockRemove: jest.Mock };
  };
  resendModule.__mocks.mockCreate.mockReset();
  resendModule.__mocks.mockGet.mockReset();
  resendModule.__mocks.mockRemove.mockReset();
  return resendModule.__mocks;
}

function build({
  decryptedConfig = { resend_api_key: 're_test' },
}: {
  decryptedConfig?: { resend_api_key: string } | null;
} = {}) {
  const prismaInner = {
    tenantEmailDomain: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const prisma = prismaInner as never;
  const emailConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(decryptedConfig) };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(0),
  };
  const redisService = { getClient: jest.fn().mockReturnValue(redis) };
  const notifier = { notifyVerified: jest.fn().mockResolvedValue(undefined) };
  const svc = new EmailDomainService(
    prisma,
    emailConfig as never,
    redisService as never,
    notifier as never,
  );
  void EMAIL_DOMAIN_NOTIFIER; // ensure import isn't pruned
  return { svc, prisma: prismaInner, emailConfig, redis, notifier };
}

describe('EmailDomainService — register', () => {
  it('creates a row with status=pending and DNS records on success', async () => {
    const mocks = freshMocks();
    mocks.mockCreate.mockResolvedValue({
      data: {
        id: 'rd_resend_1',
        records: [
          {
            record: 'SPF',
            name: 'school.edu',
            type: 'TXT',
            value: 'v=spf1 ...',
            status: 'pending',
          },
          {
            record: 'DKIM',
            name: 'resend._domainkey.school.edu',
            type: 'TXT',
            value: 'k=...',
            status: 'pending',
          },
          {
            record: 'DMARC',
            name: '_dmarc.school.edu',
            type: 'TXT',
            value: 'v=DMARC1 ...',
            status: 'pending',
          },
        ],
      },
      error: null,
    });
    const { svc, prisma, redis } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    prisma.tenantEmailDomain.create.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'pending',
    });

    const result = await svc.registerDomain(TENANT_ID, USER_ID, 'School.EDU');

    expect(result.id).toBe(DOMAIN_ID);
    expect(prisma.tenantEmailDomain.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          domain: 'school.edu',
          status: 'pending',
          spf_status: 'pending',
          dkim_status: 'pending',
          dmarc_status: 'pending',
          resend_domain_id: 'rd_resend_1',
          created_by_user_id: USER_ID,
        }),
      }),
    );
    expect(redis.del).toHaveBeenCalledWith('email-domain:verified:' + TENANT_ID + ':school.edu');
    expect(redis.publish).toHaveBeenCalled();
  });

  it('throws DOMAIN_ALREADY_REGISTERED when row exists', async () => {
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({ id: DOMAIN_ID });
    await expect(svc.registerDomain(TENANT_ID, USER_ID, 'school.edu')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.tenantEmailDomain.create).not.toHaveBeenCalled();
  });

  it('throws RESEND_DOMAIN_CREATE_FAILED when Resend returns error', async () => {
    const mocks = freshMocks();
    mocks.mockCreate.mockResolvedValue({ data: null, error: { message: 'already taken' } });
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    await expect(svc.registerDomain(TENANT_ID, USER_ID, 'school.edu')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws RESEND_DOMAIN_CREATE_FAILED when Resend SDK throws', async () => {
    const mocks = freshMocks();
    mocks.mockCreate.mockRejectedValue(new Error('ECONNREFUSED'));
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    await expect(svc.registerDomain(TENANT_ID, USER_ID, 'school.edu')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws EMAIL_NOT_CONFIGURED when no email config', async () => {
    const { svc, prisma } = build({ decryptedConfig: null });
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    await expect(svc.registerDomain(TENANT_ID, USER_ID, 'school.edu')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('EmailDomainService — refresh', () => {
  it('all-verified flips status and notifies on transition', async () => {
    const mocks = freshMocks();
    mocks.mockGet.mockResolvedValue({
      data: {
        records: [
          { record: 'SPF', name: 'school.edu', type: 'TXT', value: 'v=spf1', status: 'verified' },
          {
            record: 'DKIM',
            name: 'resend._domainkey.school.edu',
            type: 'TXT',
            value: 'k=v',
            status: 'verified',
          },
          {
            record: 'DMARC',
            name: '_dmarc.school.edu',
            type: 'TXT',
            value: 'v=DMARC1',
            status: 'verified',
          },
        ],
      },
      error: null,
    });
    const { svc, prisma, notifier } = build();
    const row = {
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'pending' as const,
      resend_domain_id: 'rd_x',
      verified_at: null,
      created_by_user_id: USER_ID,
    };
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(row);
    prisma.tenantEmailDomain.update.mockResolvedValue({
      ...row,
      status: 'verified',
      created_by_user_id: USER_ID,
    });

    const result = await svc.refreshDomain(TENANT_ID, DOMAIN_ID);
    expect(result.status).toBe('verified');
    expect(notifier.notifyVerified).toHaveBeenCalledTimes(1);
  });

  it('partial verified stays pending and does not notify', async () => {
    const mocks = freshMocks();
    mocks.mockGet.mockResolvedValue({
      data: {
        records: [
          { record: 'SPF', name: 'school.edu', type: 'TXT', value: 'v=spf1', status: 'verified' },
          {
            record: 'DKIM',
            name: 'resend._domainkey.school.edu',
            type: 'TXT',
            value: 'k=v',
            status: 'pending',
          },
          {
            record: 'DMARC',
            name: '_dmarc.school.edu',
            type: 'TXT',
            value: 'v=DMARC1',
            status: 'verified',
          },
        ],
      },
      error: null,
    });
    const { svc, prisma, notifier } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'pending',
      resend_domain_id: 'rd_x',
      verified_at: null,
      created_by_user_id: USER_ID,
    });
    prisma.tenantEmailDomain.update.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'pending',
    });

    await svc.refreshDomain(TENANT_ID, DOMAIN_ID);
    expect(notifier.notifyVerified).not.toHaveBeenCalled();
  });

  it('does NOT re-notify when row was already verified', async () => {
    const mocks = freshMocks();
    mocks.mockGet.mockResolvedValue({
      data: {
        records: [
          { record: 'SPF', name: 'x', type: 'TXT', value: 'v', status: 'verified' },
          { record: 'DKIM', name: 'y', type: 'TXT', value: 'v', status: 'verified' },
          { record: 'DMARC', name: 'z', type: 'TXT', value: 'v', status: 'verified' },
        ],
      },
      error: null,
    });
    const { svc, prisma, notifier } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'verified',
      resend_domain_id: 'rd_x',
      verified_at: new Date(),
      created_by_user_id: USER_ID,
    });
    prisma.tenantEmailDomain.update.mockResolvedValue({
      id: DOMAIN_ID,
      status: 'verified',
    });
    await svc.refreshDomain(TENANT_ID, DOMAIN_ID);
    expect(notifier.notifyVerified).not.toHaveBeenCalled();
  });

  it('throws DOMAIN_NOT_FOUND when row missing', async () => {
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    await expect(svc.refreshDomain(TENANT_ID, DOMAIN_ID)).rejects.toThrow(NotFoundException);
  });

  it('records failure_reason on Resend SDK throw', async () => {
    const mocks = freshMocks();
    mocks.mockGet.mockRejectedValue(new Error('boom'));
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      status: 'pending',
      resend_domain_id: 'rd_x',
      verified_at: null,
      created_by_user_id: USER_ID,
    });
    prisma.tenantEmailDomain.update.mockResolvedValue({ id: DOMAIN_ID });
    await svc.refreshDomain(TENANT_ID, DOMAIN_ID);
    expect(prisma.tenantEmailDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failure_reason: 'boom' }),
      }),
    );
  });
});

describe('EmailDomainService — getVerified (cache)', () => {
  it('cache hit returns parsed row', async () => {
    const { svc, redis } = build();
    redis.get.mockResolvedValue(JSON.stringify({ id: DOMAIN_ID, domain: 'school.edu' }));
    const row = await svc.getVerified(TENANT_ID, 'School.EDU');
    expect(row?.id).toBe(DOMAIN_ID);
  });

  it('cache hit __null__ returns null without DB read', async () => {
    const { svc, prisma, redis } = build();
    redis.get.mockResolvedValue('__null__');
    const result = await svc.getVerified(TENANT_ID, 'school.edu');
    expect(result).toBeNull();
    expect(prisma.tenantEmailDomain.findFirst).not.toHaveBeenCalled();
  });

  it('cache miss → DB read → caches result', async () => {
    const { svc, prisma, redis } = build();
    redis.get.mockResolvedValue(null);
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({
      id: DOMAIN_ID,
      domain: 'school.edu',
      status: 'verified',
    });
    const row = await svc.getVerified(TENANT_ID, 'school.edu');
    expect(row?.id).toBe(DOMAIN_ID);
    expect(redis.set).toHaveBeenCalledWith(
      'email-domain:verified:' + TENANT_ID + ':school.edu',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('cache miss → DB null → caches __null__ sentinel', async () => {
    const { svc, prisma, redis } = build();
    redis.get.mockResolvedValue(null);
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    const row = await svc.getVerified(TENANT_ID, 'school.edu');
    expect(row).toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      'email-domain:verified:' + TENANT_ID + ':school.edu',
      '__null__',
      'EX',
      300,
    );
  });
});

describe('EmailDomainService — delete', () => {
  it('removes locally even when Resend returns 404', async () => {
    const mocks = freshMocks();
    const remove404 = Object.assign(new Error('not found'), { statusCode: 404 });
    mocks.mockRemove.mockRejectedValue(remove404);
    const { svc, prisma, redis } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.edu',
      resend_domain_id: 'rd_x',
    });
    prisma.tenantEmailDomain.delete.mockResolvedValue({ id: DOMAIN_ID });
    await svc.deleteDomain(TENANT_ID, DOMAIN_ID, USER_ID);
    expect(prisma.tenantEmailDomain.delete).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });

  it('throws DOMAIN_NOT_FOUND when row missing', async () => {
    const { svc, prisma } = build();
    prisma.tenantEmailDomain.findFirst.mockResolvedValue(null);
    await expect(svc.deleteDomain(TENANT_ID, DOMAIN_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
