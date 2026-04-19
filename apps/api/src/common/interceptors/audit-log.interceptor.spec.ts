import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
    currentUser?: { sub: string } | null;
    headers?: Record<string, string>;
    ip?: string;
    params?: Record<string, string>;
    statusCode?: number;
    tenantContext?: { tenant_id: string } | null;
  },
): ExecutionContext {
  const handler = jest.fn();
  const controllerClass = class TestController {};
  const request = {
    body,
    currentUser: overrides?.currentUser !== undefined ? overrides.currentUser : { sub: USER_ID },
    headers: overrides?.headers ?? { 'user-agent': 'jest-agent' },
    ip: overrides?.ip ?? '127.0.0.1',
    method,
    originalUrl: url,
    params: overrides?.params ?? {},
    tenantContext:
      overrides?.tenantContext !== undefined ? overrides.tenantContext : { tenant_id: TENANT_ID },
  };
  const response = {
    statusCode: overrides?.statusCode ?? 200,
  };

  return {
    getClass: () => controllerClass,
    getHandler: () => handler,
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
  let mockAuditLogService: { enqueue: jest.Mock };
  let mockReflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    mockAuditLogService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };

    interceptor = new AuditLogInterceptor(
      mockAuditLogService as unknown as AuditLogService,
      mockReflector as unknown as Reflector,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('intercept()', () => {
    it('passes through undecorated GET requests without auditing', (done) => {
      const context = createMockContext('GET', '/api/v1/students');
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.enqueue).not.toHaveBeenCalled();
          done();
        },
      });
    });

    it('audits mutation requests with mutation metadata', (done) => {
      const context = createMockContext('POST', '/api/v1/students', {
        password: 'secret',
        safe: 'keep-me',
      });
      const handler = createMockHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.enqueue).toHaveBeenCalledWith(
            TENANT_ID,
            USER_ID,
            'students',
            null,
            'POST /api/v1/students',
            expect.objectContaining({
              body: {
                password: '[REDACTED]',
                safe: 'keep-me',
              },
              category: 'mutation',
              path: '/api/v1/students',
              sensitivity: 'normal',
            }),
            '127.0.0.1',
          );
          done();
        },
      });
    });

    it('audits decorated GET requests as read access without response payload content', (done) => {
      mockReflector.getAllAndOverride.mockReturnValue({
        sensitivity: 'financial',
      });
      const context = createMockContext(
        'GET',
        `/api/v1/staff-profiles/${UUID_EXAMPLE}/bank-details`,
      );
      const handler = createMockHandler({
        id: UUID_EXAMPLE,
        bank_account_number_masked: '****1234',
      });

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.enqueue).toHaveBeenCalledWith(
            TENANT_ID,
            USER_ID,
            'bank-details',
            UUID_EXAMPLE,
            `GET /api/v1/staff-profiles/${UUID_EXAMPLE}/bank-details`,
            expect.objectContaining({
              accessed_entity_ids: [UUID_EXAMPLE],
              accessed_record_count: 1,
              category: 'read_access',
              path: `/api/v1/staff-profiles/${UUID_EXAMPLE}/bank-details`,
              sensitivity: 'financial',
            }),
            '127.0.0.1',
          );

          const metadata = mockAuditLogService.enqueue.mock.calls[0]?.[5] as Record<
            string,
            unknown
          >;
          expect(metadata).not.toHaveProperty('body');
          expect(metadata).not.toHaveProperty('response');
          done();
        },
      });
    });

    it('uses entityIdField metadata to resolve IDs from the request body', (done) => {
      mockReflector.getAllAndOverride.mockReturnValue({
        entityIdField: 'user_id',
        entityType: 'impersonation',
        sensitivity: 'cross_tenant',
      });
      const context = createMockContext('POST', '/api/v1/admin/impersonate', {
        tenant_id: TENANT_ID,
        user_id: UUID_EXAMPLE,
      });
      const handler = createMockHandler({ access_token: 'token' });

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(mockAuditLogService.enqueue).toHaveBeenCalledWith(
            TENANT_ID,
            USER_ID,
            'impersonation',
            UUID_EXAMPLE,
            'POST /api/v1/admin/impersonate',
            expect.objectContaining({
              category: 'mutation',
              sensitivity: 'cross_tenant',
            }),
            '127.0.0.1',
          );
          done();
        },
      });
    });

    it('extracts array entity IDs for successful decorated GET list responses', (done) => {
      mockReflector.getAllAndOverride.mockReturnValue({
        sensitivity: 'special_category',
      });
      const context = createMockContext('GET', '/api/v1/students/allergy-report');
      const handler = createMockHandler({
        data: [{ student_id: UUID_EXAMPLE }, { student_id: UUID_EXAMPLE_2 }],
        meta: { total: 2 },
      });

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          const metadata = mockAuditLogService.enqueue.mock.calls[0]?.[5] as Record<
            string,
            unknown
          >;
          expect(metadata).toEqual(
            expect.objectContaining({
              accessed_entity_ids: [UUID_EXAMPLE, UUID_EXAMPLE_2],
              accessed_record_count: 2,
              category: 'read_access',
              sensitivity: 'special_category',
            }),
          );
          done();
        },
      });
    });

    it('does not audit failed requests', (done) => {
      const context = createMockContext('POST', '/api/v1/students');
      const handler = createErrorHandler(new Error('Validation failed'));

      interceptor.intercept(context, handler).subscribe({
        error: () => {
          expect(mockAuditLogService.enqueue).not.toHaveBeenCalled();
          done();
        },
        next: () => {
          done.fail('Expected request to fail');
        },
      });
    });

    it('does not fail the request if audit preparation throws', (done) => {
      mockAuditLogService.enqueue.mockImplementation(() => {
        throw new Error('audit failure');
      });
      const context = createMockContext('POST', '/api/v1/students');
      const handler = createMockHandler({ id: 'created-1' });

      interceptor.intercept(context, handler).subscribe({
        next: (value) => {
          expect(value).toEqual({ id: 'created-1' });
          done();
        },
        error: () => {
          done.fail('Request should not fail because audit logging threw');
        },
      });
    });
  });
});
