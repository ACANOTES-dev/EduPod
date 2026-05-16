import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import type { Request, Response } from 'express';

import { PlatformErrorLogService } from '../../modules/platform-error-log/platform-error-log.service';
import { getRequestContext } from '../middleware/correlation.middleware';
import type { AuthenticatedRequest } from '../types/request.types';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly platformErrorLogService?: PlatformErrorLogService) {}

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let details: unknown;
    let message = 'An unexpected error occurred';
    let moduleKey: string | undefined;

    if (!(exception instanceof HttpException)) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`Unhandled exception: ${err.message}`, err.stack);
    }

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.getCodeFromStatus(status);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        const nestedError = resp['error'];
        const errorObj =
          typeof nestedError === 'object' && nestedError !== null
            ? (nestedError as Record<string, unknown>)
            : resp;

        if (typeof errorObj['message'] === 'string') {
          message = errorObj['message'];
        }

        if (typeof errorObj['code'] === 'string') {
          code = errorObj['code'];
        } else {
          code = this.getCodeFromStatus(status);
        }

        details = errorObj['details'] ?? resp['details'];

        if (typeof errorObj['module'] === 'string') {
          moduleKey = errorObj['module'];
        }
      } else {
        code = this.getCodeFromStatus(status);
      }
    }

    response.status(status).json({
      error: {
        code,
        ...(moduleKey !== undefined && { module: moduleKey }),
        message,
        ...(details !== undefined && { details }),
      },
    });

    this.capturePlatformError(exception, request, status, code);
  }

  private capturePlatformError(
    exception: unknown,
    request: Request,
    status: number,
    code: string,
  ): void {
    if (!this.platformErrorLogService || status < 500) {
      return;
    }

    try {
      const authenticatedRequest = request as Partial<AuthenticatedRequest>;
      const requestContext = getRequestContext();
      const user = authenticatedRequest.currentUser;
      const tenantContext = authenticatedRequest.tenantContext;
      const message = exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;

      void this.platformErrorLogService
        .capture({
          source: 'api',
          level: 'error',
          message,
          stack,
          endpoint: `${request.method} ${request.path}`,
          http_status: status,
          error_code: code,
          tenant_id: user?.tenant_id ?? tenantContext?.tenant_id ?? requestContext?.tenantId,
          user_id: user?.sub ?? requestContext?.userId,
          correlation_id: requestContext?.requestId,
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to capture platform error log: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    } catch (err: unknown) {
      this.logger.error(
        `Platform error-log capture failed before dispatch: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private getCodeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMITED';
      case 501:
        return 'NOT_IMPLEMENTED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
