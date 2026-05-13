import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  TENANT_MODULE_PRISMA_CLIENT,
  TENANT_MODULE_REDIS_CLIENT,
  TenantModuleService,
} from '../../../api/src/common/services/tenant-module.service';
import { getRedisClient } from '../base/redis.helpers';

@Module({
  providers: [
    {
      provide: 'PRISMA_CLIENT',
      useFactory: async () => {
        const client = new PrismaClient();
        await client.$connect();
        return client;
      },
    },
    { provide: TENANT_MODULE_PRISMA_CLIENT, useExisting: 'PRISMA_CLIENT' },
    { provide: TENANT_MODULE_REDIS_CLIENT, useFactory: () => getRedisClient() },
    TenantModuleService,
  ],
  exports: ['PRISMA_CLIENT', TenantModuleService],
})
export class WorkerSharedServicesModule {}
