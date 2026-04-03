# Worker Debugging

Local developer guide for inspecting BullMQ queues, checking repeatable jobs, and replaying failed work safely.

---

## Start the Worker

Run the local stack:

```bash
docker compose up -d
pnpm dev
```

Confirm the worker is alive:

```bash
curl -sf http://localhost:5556/health && echo "WORKER OK"
```

In development, Bull Board is available at:

```text
http://localhost:5556/admin/queues
```

---

## Queue Map

The worker registers one queue per domain:

`admissions`, `approvals`, `attendance`, `behaviour`, `compliance`, `early-warning`, `engagement`, `finance`, `gradebook`, `homework`, `imports`, `notifications`, `pastoral`, `payroll`, `regulatory`, `reports`, `scheduling`, `search-sync`, `security`, `wellbeing`

This list comes from `apps/worker/src/base/queue.constants.ts`.

---

## Inspect Failed Jobs

The fastest path is Bull Board:

1. Open `/admin/queues`
2. Select the queue
3. Open the `Failed` tab
4. Inspect the payload, attempts, and stack trace

If you prefer the terminal, list failed jobs in a queue with `tsx`:

```bash
pnpm --filter @school/worker exec tsx <<'TS'
import { Queue } from 'bullmq';
import { getRedisClient } from './src/base/redis.helpers';

const queue = new Queue('engagement', { connection: getRedisClient() });
const failedJobs = await queue.getFailed(0, 20);

for (const job of failedJobs) {
  console.log({
    id: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
  });
}

await queue.close();
await getRedisClient().quit();
TS
```

Change `'engagement'` to the queue you need.

---

## Replay a Failed Job

Retry from Bull Board when possible because it preserves the exact saved payload.

To retry from the terminal:

```bash
pnpm --filter @school/worker exec tsx <<'TS'
import { Queue } from 'bullmq';
import { getRedisClient } from './src/base/redis.helpers';

const queue = new Queue('engagement', { connection: getRedisClient() });
const [job] = await queue.getFailed(0, 0);

if (!job) {
  console.log('No failed jobs found.');
} else {
  await job.retry();
  console.log(`Retried job ${job.id} (${job.name})`);
}

await queue.close();
await getRedisClient().quit();
TS
```

Only retry jobs you understand. Many processors are tenant-aware and expect a valid `tenant_id` in the saved payload.

---

## Check Repeatable Cron Jobs

Repeatable jobs are registered on worker startup by `CronSchedulerService`. They use `cron:<job-name>` IDs for deduplication.

Check the startup logs:

```bash
pnpm --filter @school/worker dev
```

Look for lines like:

```text
Registered repeatable cron: homework:digest (daily 07:00 UTC)
```

You can also inspect repeatable jobs directly:

```bash
pnpm --filter @school/worker exec tsx <<'TS'
import { Queue } from 'bullmq';
import { getRedisClient } from './src/base/redis.helpers';

const queue = new Queue('notifications', { connection: getRedisClient() });
const jobs = await queue.getRepeatableJobs();

for (const job of jobs) {
  console.log({
    key: job.key,
    name: job.name,
    next: job.next,
    pattern: job.pattern,
  });
}

await queue.close();
await getRedisClient().quit();
TS
```

Use the queue that owns the cron you want to inspect.

---

## Safe Replay Checklist

Before replaying or retrying a job:

1. Confirm the payload still matches the current schema.
2. Confirm the referenced tenant and entity IDs still exist.
3. Check whether the processor has external side effects such as notifications, exports, or callbacks.
4. Prefer a single-job retry before bulk replay.
5. Watch the worker logs immediately after replay so you can stop if the failure repeats.
