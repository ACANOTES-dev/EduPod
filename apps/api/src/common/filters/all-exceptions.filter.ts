import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let details: unknown;
    let message = 'An unexpected error occurred';

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
      } else {
        code = this.getCodeFromStatus(status);
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    });
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
