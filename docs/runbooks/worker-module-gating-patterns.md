---
title: Worker module gating patterns
description: Module-gating patterns for cron dispatchers, event-driven processors, and provider webhooks.
alert_keys: [module.gating.worker.skip, queue.failed_jobs]
audit_actions: [module_toggled]
error_fingerprints: []
components: [worker, bullmq]
severity: p2
tags: [worker, module-gating, queues]
---

# Worker Module Gating Patterns

Module-gated worker code reads tenant module state through
`TenantModuleService`. Do not query `tenantModule` directly inside processors.

## Pattern A: cron dispatcher tenant skip

Use this for cross-tenant crons that fan out one job per active tenant. Query
active tenants, then check the relevant module before enqueuing tenant work.

```ts
for (const tenant of tenants) {
  const enabled = await this.tenantModuleService.isEnabled(tenant.id, 'pastoral');
  if (!enabled) {
    this.logger.log(`Skipping pastoral cron for tenant ${tenant.id} — module disabled`);
    continue;
  }

  await this.pastoralQueue.add(OVERDUE_ACTIONS_JOB, { tenant_id: tenant.id });
}
```

`behaviour:cron-dispatch-daily`, `behaviour:cron-dispatch-sla`,
`behaviour:cron-dispatch-monthly`, `pastoral:cron-dispatch-overdue`,
`early-warning:compute-daily`, and `early-warning:weekly-digest` follow this
pattern.

## Pattern B: job-level guard

Use this for event-driven processors and user-triggered jobs. Check the tenant
module at the top of `process()` and return without error when disabled.
Disabled state is normal, so the job is acknowledged as complete.

```ts
const enabled = await this.tenantModuleService.isEnabled(
  job.data.tenant_id,
  'communications_outbound',
);

if (!enabled) {
  this.logger.log(
    `Dropping outbound notification for tenant ${job.data.tenant_id} — module disabled`,
  );
  return;
}
```

Webhook handlers are a special case: Stripe, Resend, Twilio, and similar
providers must still receive a successful acknowledgement. Resolve the tenant,
check the module inside the handler or job, log the no-op, and return success
so the provider does not retry forever.
