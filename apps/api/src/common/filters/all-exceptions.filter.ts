import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

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
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        // Handle nested error objects: { error: { code, message, details } }
        const errorObj = (resp['error'] && typeof resp['error'] === 'object')
          ? resp['error'] as Record<string, unknown>
          : resp;
        message = (errorObj['message'] as string) || message;
        code = (errorObj['code'] as string) || this.getCodeFromStatus(status);
        details = (errorObj['details'] as Record<string, unknown>) ?? (resp['details'] as Record<string, unknown> | undefined);
      } else {
        code = this.getCodeFromStatus(status);
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details && { details }),
      },
    });
  }

  private getCodeFromStatus(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'VALIDATION_ERROR';
      case 429: return 'RATE_LIMITED';
      case 501: return 'NOT_IMPLEMENTED';
      default: return 'INTERNAL_ERROR';
    }
  }
}
