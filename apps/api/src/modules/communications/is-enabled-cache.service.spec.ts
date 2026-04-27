import { IsEnabledCacheService } from './is-enabled-cache.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function build({
  emailRow = null,
  smsRow = null,
  whatsappRow = null,
}: {
  emailRow?: { is_enabled: boolean } | null;
  smsRow?: { is_enabled: boolean } | null;
  whatsappRow?: { is_enabled: boolean } | null;
} = {}) {
  let busHandler:
    | ((event: { tenant_id: string; channel: 'email' | 'sms' | 'whatsapp' }) => void)
    | null = null;

  const prisma = {
    tenantEmailConfig: { findUnique: jest.fn().mockResolvedValue(emailRow) },
    tenantSmsConfig: { findUnique: jest.fn().mockResolvedValue(smsRow) },
    tenantWhatsAppConfig: { findUnique: jest.fn().mockResolvedValue(whatsappRow) },
  };
  const cacheBus = {
    subscribe: jest.fn((handler: typeof busHandler) => {
      busHandler = handler;
    }),
  };
  const svc = new IsEnabledCacheService(prisma as never, cacheBus as never);
  return {
    svc,
    prisma,
    cacheBus,
    fireBus: (channel: 'email' | 'sms' | 'whatsapp') => {
      if (!busHandler) throw new Error('bus handler not registered');
      busHandler({ tenant_id: TENANT_ID, channel });
    },
  };
}

describe('IsEnabledCacheService', () => {
  it('returns true when DB row has is_enabled=true', async () => {
    const { svc } = build({ emailRow: { is_enabled: true } });
    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(true);
  });

  it('returns false when no DB row', async () => {
    const { svc } = build();
    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(false);
  });

  it('caches result for 30 seconds', async () => {
    const { svc, prisma } = build({ emailRow: { is_enabled: true } });
    await svc.getEnabled(TENANT_ID, 'email');
    await svc.getEnabled(TENANT_ID, 'email');
    await svc.getEnabled(TENANT_ID, 'email');
    expect(prisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  it('cache bus event drops the matching key', async () => {
    const { svc, prisma, fireBus } = build({ emailRow: { is_enabled: true } });
    await svc.getEnabled(TENANT_ID, 'email');
    fireBus('email');
    await svc.getEnabled(TENANT_ID, 'email');
    expect(prisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(2);
  });

  it('cache bus event for different channel does not evict', async () => {
    const { svc, prisma, fireBus } = build({ emailRow: { is_enabled: true } });
    await svc.getEnabled(TENANT_ID, 'email');
    fireBus('sms');
    await svc.getEnabled(TENANT_ID, 'email');
    expect(prisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  it('separate cache entries per (tenant, channel)', async () => {
    const { svc, prisma } = build({
      emailRow: { is_enabled: true },
      smsRow: { is_enabled: false },
    });
    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(true);
    expect(await svc.getEnabled(TENANT_ID, 'sms')).toBe(false);
    expect(prisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.tenantSmsConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  it('explicit invalidate clears the cache', async () => {
    const { svc, prisma } = build({ emailRow: { is_enabled: true } });
    await svc.getEnabled(TENANT_ID, 'email');
    svc.invalidate(TENANT_ID, 'email');
    await svc.getEnabled(TENANT_ID, 'email');
    expect(prisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});
