/* eslint-disable import/order -- instrument must load before NestJS reads process.env */
import './instrument';

import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);

  // Global BullMQ worker error handler — captures unhandled worker-level errors to Sentry.
  // Job-level errors are handled by individual processors; this catches infrastructure-level
  // failures (e.g. Redis connection drops, serialisation errors) that escape processor scope.
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] Unhandled rejection:', reason);
    Sentry.captureException(reason);
  });

  // Health check endpoint for container health checks
  const port = process.env.WORKER_PORT || 5556;
  await app.listen(port);
  console.warn(`Worker service running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  Sentry.captureException(err);
  process.exit(1);
});
