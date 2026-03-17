import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { ResponseTransformInterceptor } from './response-transform.interceptor';

describe('ResponseTransformInterceptor', () => {
  let interceptor: ResponseTransformInterceptor;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    interceptor = new ResponseTransformInterceptor();
  });

  it('should wrap response in { data: T } envelope', (done) => {
    const mockHandler: CallHandler = {
      handle: () => of({ id: 1, name: 'test' }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: 1, name: 'test' } });
      done();
    });
  });

  it('should not double-wrap already-enveloped response', (done) => {
    const mockHandler: CallHandler = {
      handle: () => of({ data: { id: 1 } }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: 1 } });
      done();
    });
  });

  it('should wrap response with status property in data envelope', (done) => {
    const mockHandler: CallHandler = {
      handle: () => of({ status: 'ok', checks: { postgres: 'up' } }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toEqual({ data: { status: 'ok', checks: { postgres: 'up' } } });
      done();
    });
  });

  it('should convert BigInt values to numbers', (done) => {
    const mockHandler: CallHandler = {
      handle: () => of({ id: 'abc', count: BigInt(42) }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((result) => {
      expect(result).toEqual({ data: { id: 'abc', count: 42 } });
      done();
    });
  });
});
