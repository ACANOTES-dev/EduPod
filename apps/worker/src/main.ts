/* eslint-disable import/order -- instrument must load before NestJS reads process.env */
import './instrument';

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';

import { QUEUE_NAMES } from './base/queue.constants';
import { validateEnv } from './env.validation';
import { WorkerModule } from './worker.module';

validateEnv();

function registerBullBoard(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  port: string | number,
) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = Object.values(QUEUE_NAMES).map((queueName) => {
    const queue = app.get<Queue>(getQueueToken(queueName), { strict: false });
    return new BullMQAdapter(queue);
  });

  createBullBoard({
    queues,
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());
  console.warn(`BullMQ dashboard running on http://localhost:${port}/admin/queues`);
}

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);
  const port = process.env.WORKER_PORT || 5556;

  registerBullBoard(app, port);

  app.enableShutdownHooks();

  // Health check endpoint for container health checks
  await app.listen(port);
  console.warn(`Worker service running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
