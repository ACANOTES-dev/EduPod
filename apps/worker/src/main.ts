import { config } from 'dotenv';
import { resolve } from 'path';

// Preload .env so process.env is populated before NestJS/Prisma/BullMQ reads it
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);

  // Health check endpoint for container health checks
  const port = process.env.WORKER_PORT || 5556;
  await app.listen(port);
  console.warn(`Worker service running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
