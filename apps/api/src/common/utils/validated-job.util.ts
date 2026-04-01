import type { JobsOptions, Queue } from 'bullmq';

interface PayloadSchema<TPayload> {
  parse: (payload: unknown) => TPayload;
}

export async function addValidatedJob<TPayload>(
  queue: Queue,
  jobName: string,
  schema: PayloadSchema<TPayload>,
  payload: unknown,
  options?: JobsOptions,
) {
  const validatedPayload = schema.parse(payload);

  if (options === undefined) {
    return queue.add(jobName, validatedPayload);
  }

  return queue.add(jobName, validatedPayload, options);
}
