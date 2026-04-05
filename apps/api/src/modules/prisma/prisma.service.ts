import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { RequestContextService } from '../../common/services/request-context.service';

const PRISMA_MODEL_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

function isPrismaDelegate(value: unknown): value is object {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    typeof Reflect.get(value, 'findMany') === 'function' ||
    typeof Reflect.get(value, 'findFirst') === 'function' ||
    typeof Reflect.get(value, 'create') === 'function' ||
    typeof Reflect.get(value, 'update') === 'function' ||
    typeof Reflect.get(value, 'delete') === 'function' ||
    typeof Reflect.get(value, 'count') === 'function'
  );
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly delegateCache = new Map<string, object>();

  constructor(private readonly requestContext: RequestContextService) {
    super();

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof prop !== 'string' || prop.startsWith('$') || !isPrismaDelegate(value)) {
          return typeof value === 'function' ? value.bind(target) : value;
        }

        return target.wrapDelegate(prop, value);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private wrapDelegate(delegateKey: string, delegate: object): object {
    const cached = this.delegateCache.get(delegateKey);
    if (cached) {
      return cached;
    }

    const wrapped = new Proxy(delegate, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof prop !== 'string' || typeof value !== 'function') {
          return value;
        }

        if (!PRISMA_MODEL_OPERATIONS.has(prop)) {
          return value.bind(target);
        }

        return async (...args: unknown[]) => {
          const context = this.requestContext.get();
          if (!context?.tenant_id) {
            return value.apply(target, args);
          }

          return runWithRlsContext(
            this,
            {
              tenant_id: context.tenant_id,
              user_id: context.user_id,
              membership_id: context.membership_id,
              tenant_domain: context.tenant_domain,
            },
            async (tx) => {
              const txDelegate = Reflect.get(tx as object, delegateKey) as Record<string, unknown>;
              const txOperation = Reflect.get(txDelegate, prop);
              if (typeof txOperation !== 'function') {
                throw new Error(`Prisma delegate "${delegateKey}.${prop}" is not callable`);
              }

              return Reflect.apply(txOperation, txDelegate, args);
            },
          );
        };
      },
    });

    this.delegateCache.set(delegateKey, wrapped);
    return wrapped;
  }
}
