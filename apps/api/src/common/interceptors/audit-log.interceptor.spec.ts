import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { AuditLogService } from '../../modules/audit-log/audit-log.service';

import { AuditLogInterceptor } from './audit-log.interceptor';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const UUID_EXAMPLE = '11111111-2222-3333-4444-555555555555';
const UUID_EXAMPLE_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function createMockContext(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  overrides?: {
    tenantContext?: { tenant_id: string } | null;
    currentUser?: { sub: string } | null;
    statusCode?: number;
    ip?: string;
  },
): ExecutionContext {
  const request = {
    method,
    originalUrl: url,
    body,
    ip: overrides?.ip ?? '127.0.0.1',
    tenantContext: overrides?.tenantContext !== undefined ? overrides.tenantContext : { tenant_id: TENANT_ID },
    currentUser: overrides?.currentUser !== undefined ? overrides.currentUser : { sub: USER_ID },
  };

  const response = {
    statusCode: overrides?.statusCode ?? 200,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createMockHandler(returnValue: unknown = { id: '1' }): CallHandler {
  return {
    handle: () => of(returnValue),
  };
}

function createErrorHandler(error: Error): CallHandler {
  return {
    handle: () => throwError(() => error),
  };
}

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let mockAuditLogService: { write: jest.Mock };

  beforeEach(() => {
    mockAuditLogService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    interceptor = new AuditLogInterceptor(
      mockAuditLogService as unknown as AuditLogService,
    );
  });

  // ─── intercept() — method filtering ───────────────────────────────

  describe('intercept() — method filtering', () => {
    it('should pass through GET requests without auditing', (done) => {
      const context = createMockContext('GET', '/api/v1/students');
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('should audit POST requests', (done) => {
      const context = createMockContext('POST', `/api/v1/students`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should audit PUT requests', (done) => {
      const context = createMockContext('PUT', `/api/v1/students/${UUID_EXAMPLE}`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should audit PATCH requests', (done) => {
      const context = createMockContext('PATCH', `/api/v1/students/${UUID_EXAMPLE}`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should audit DELETE requests', (done) => {
      const context = createMockContext('DELETE', `/api/v1/students/${UUID_EXAMPLE}`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalled();
          done();
        },
      });
    });
  });

  // ─── parseEntityFromPath() — tested indirectly via intercept ──────

  describe('parseEntityFromPath() — entity extraction', () => {
    it('should parse entity_type and entity_id from /v1/students/{uuid}', (done) => {
      const context = createMockContext('POST', `/api/v1/students/${UUID_EXAMPLE}`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            TENANT_ID,
            USER_ID,
            'students',
            UUID_EXAMPLE,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should parse nested resource /v1/compliance-requests/{uuid}/classify', (done) => {
      const context = createMockContext('POST', `/api/v1/compliance-requests/${UUID_EXAMPLE}/classify`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'compliance-requests',
            UUID_EXAMPLE,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should fallback to first segment for /v1/imports/upload', (done) => {
      const context = createMockContext('POST', '/api/v1/imports/upload');
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'imports',
            null,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should strip query string before parsing', (done) => {
      const context = createMockContext('POST', `/api/v1/students/${UUID_EXAMPLE}?expand=true`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'students',
            UUID_EXAMPLE,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should parse deepest resource/uuid pair from /v1/tenants/{uuid1}/students/{uuid2}', (done) => {
      const context = createMockContext(
        'PATCH',
        `/api/v1/tenants/${UUID_EXAMPLE}/students/${UUID_EXAMPLE_2}`,
      );
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'students',
            UUID_EXAMPLE_2,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should return unknown when no segments (/)', (done) => {
      const context = createMockContext('POST', '/');
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'unknown',
            null,
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });

    it('should skip api and v1 segments', (done) => {
      const context = createMockContext('POST', `/api/v1/students/${UUID_EXAMPLE}`);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          // Should NOT be 'api' or 'v1'
          expect(mockAuditLogService.write).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            'students',
            expect.any(String),
            expect.any(String),
            expect.any(Object),
            expect.any(String),
          );
          done();
        },
      });
    });
  });

  // ─── sanitizeBody() — tested indirectly via metadata ──────────────

  describe('sanitizeBody()', () => {
    it('should redact password field', (done) => {
      const context = createMockContext('POST', '/api/v1/auth/login', {
        email: 'test@example.com',
        password: 'secret123',
      });
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.write.mock.calls[0]?.[5] as Record<string, unknown>;
          const body = metadata.body as Record<string, unknown>;

          expect(body.password).toBe('[REDACTED]');
          expect(body.email).toBe('test@example.com');
          done();
        },
      });
    });

    it('should redact all sensitive fields', (done) => {
      const sensitiveBody = {
        password: 'secret',
        token: 'tok-123',
        secret: 'ssecret',
        mfa_secret: 'mfa123',
        refresh_token: 'rt-123',
        current_password: 'old123',
        new_password: 'new123',
        password_hash: 'hash123',
        username: 'admin',
      };
      const context = createMockContext('POST', '/api/v1/auth/register', sensitiveBody);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.write.mock.calls[0]?.[5] as Record<string, unknown>;
          const body = metadata.body as Record<string, unknown>;

          expect(body.password).toBe('[REDACTED]');
          expect(body.token).toBe('[REDACTED]');
          expect(body.secret).toBe('[REDACTED]');
          expect(body.mfa_secret).toBe('[REDACTED]');
          expect(body.refresh_token).toBe('[REDACTED]');
          expect(body.current_password).toBe('[REDACTED]');
          expect(body.new_password).toBe('[REDACTED]');
          expect(body.password_hash).toBe('[REDACTED]');
          expect(body.username).toBe('admin'); // not redacted
          done();
        },
      });
    });

    it('should pass through non-sensitive fields unchanged', (done) => {
      const body = { name: 'Test School', city: 'Dubai', postal_code: '12345' };
      const context = createMockContext('POST', '/api/v1/tenants', body);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.write.mock.calls[0]?.[5] as Record<string, unknown>;
          const sanitizedBody = metadata.body as Record<string, unknown>;

          expect(sanitizedBody.name).toBe('Test School');
          expect(sanitizedBody.city).toBe('Dubai');
          expect(sanitizedBody.postal_code).toBe('12345');
          done();
        },
      });
    });

    it('should return undefined for undefined body', (done) => {
      const context = createMockContext('DELETE', `/api/v1/students/${UUID_EXAMPLE}`, undefined);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.write.mock.calls[0]?.[5] as Record<string, unknown>;
          expect(metadata.body).toBeUndefined();
          done();
        },
      });
    });

    it('should return undefined for non-object body (null)', (done) => {
      const context = createMockContext('POST', '/api/v1/students', null as unknown as Record<string, unknown>);
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.write.mock.calls[0]?.[5] as Record<string, unknown>;
          expect(metadata.body).toBeUndefined();
          done();
        },
      });
    });
  });

  // ─── Non-blocking behaviour ───────────────────────────────────────

  describe('non-blocking behaviour', () => {
    it('should not fail the request when audit write throws', (done) => {
      mockAuditLogService.write.mockImplementation(() => {
        throw new Error('DB connection failed');
      });

      const context = createMockContext('POST', '/api/v1/students');
      const handler = createMockHandler({ id: 'created-1' });

      interceptor.intercept(context, handler).subscribe({
        next: (value) => {
          // The response should still be returned despite write() throwing
          expect(value).toEqual({ id: 'created-1' });
          done();
        },
        error: () => {
          done.fail('Request should not have failed due to audit error');
        },
      });
    });

    it('should not audit failed requests (error tap branch)', (done) => {
      const context = createMockContext('POST', '/api/v1/students');
      const handler = createErrorHandler(new Error('Validation failed'));

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          done.fail('Should not have received a value');
        },
        error: () => {
          expect(mockAuditLogService.write).not.toHaveBeenCalled();
          done();
        },
      });
    });
  });
});
