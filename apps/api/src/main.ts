import './instrument';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { StructuredLoggerService } from './common/services/logger.service';
import { validateEnv } from './modules/config/env.validation';

// ─── Pre-bootstrap env validation ─────────────────────────────────────────────
// Runs before NestFactory.create() — exits immediately if any required var is
// missing or invalid so the app never starts in a misconfigured state.
validateEnv();

async function bootstrap() {
  const logger = new StructuredLoggerService();
  logger.setLogLevels(StructuredLoggerService.getLogLevels());

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger,
  });

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS
  const corsOrigins: (string | RegExp)[] = [
    process.env.APP_URL || 'http://localhost:5551',
    /^https?:\/\/[\w-]+\.edupod\.app(:\d+)?$/,
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('School OS API')
      .setDescription('School Operating System API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = process.env.API_PORT || 5552;
  await app.listen(port);
  console.warn(`API running on http://localhost:${port}`);
}

bootstrap();
