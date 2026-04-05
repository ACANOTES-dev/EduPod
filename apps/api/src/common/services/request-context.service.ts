import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export type RequestContextStore = {
  tenant_id?: string;
  user_id?: string;
  membership_id?: string;
  tenant_domain?: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(context: RequestContextStore, callback: () => T): T {
    return this.storage.run({ ...context }, callback);
  }

  get(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  set(context: Partial<RequestContextStore>): void {
    const store = this.storage.getStore();
    if (!store) return;

    Object.assign(store, context);
  }
}
