import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import type { ModuleKey } from '@school/shared/modules';

import {
  createTenantFixture,
  type TenantFixture,
  type TenantFixtureOptions,
} from '../tenant-fixture.builder';

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:5554';

export async function createTenantWithModuleDisabled(
  prisma: PrismaClient,
  key: ModuleKey,
  options?: TenantFixtureOptions,
): Promise<TenantFixture> {
  const fixture = await createTenantFixture(prisma, options);
  await disableModuleForTenant(prisma, fixture.tenantId, key);
  return fixture;
}

export async function createTenantWithModuleEnabled(
  prisma: PrismaClient,
  key: ModuleKey,
  options?: TenantFixtureOptions,
): Promise<TenantFixture> {
  const fixture = await createTenantFixture(prisma, options);
  await enableModuleForTenant(prisma, fixture.tenantId, key);
  return fixture;
}

export async function disableModuleForTenant(
  prisma: PrismaClient,
  tenantId: string,
  key: ModuleKey,
): Promise<void> {
  await setTenantModuleState(prisma, tenantId, key, false);
}

export async function enableModuleForTenant(
  prisma: PrismaClient,
  tenantId: string,
  key: ModuleKey,
): Promise<void> {
  await setTenantModuleState(prisma, tenantId, key, true);
}

async function setTenantModuleState(
  prisma: PrismaClient,
  tenantId: string,
  key: ModuleKey,
  isEnabled: boolean,
): Promise<void> {
  const existing = await prisma.tenantModule.findFirst({
    where: { tenant_id: tenantId, module_key: key },
    select: { id: true },
  });

  if (existing) {
    await prisma.tenantModule.update({
      where: { id: existing.id },
      data: { is_enabled: isEnabled },
    });
  } else {
    await prisma.tenantModule.create({
      data: { tenant_id: tenantId, module_key: key, is_enabled: isEnabled },
    });
  }

  const redis = new Redis(TEST_REDIS_URL);
  try {
    await redis.del(`tenant_modules:${tenantId}`);
  } finally {
    await redis.quit();
  }
}
