import { Test, TestingModule } from '@nestjs/testing';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { RequestContextService } from '../../common/services/request-context.service';

import { PrismaService } from './prisma.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn(async (_prisma, _context, fn) =>
    fn({
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 'student-1' }]),
      },
    }),
  ),
}));

describe('PrismaService', () => {
  let service: PrismaService;
  let requestContext: RequestContextService;
  let connectMock: jest.Mock;
  let disconnectMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, RequestContextService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    requestContext = module.get<RequestContextService>(RequestContextService);

    // Stub the underlying PrismaClient methods so we never touch a real DB
    connectMock = jest.fn().mockResolvedValue(undefined);
    disconnectMock = jest.fn().mockResolvedValue(undefined);
    service.$connect = connectMock;
    service.$disconnect = disconnectMock;
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call $connect on module init', async () => {
    await service.onModuleInit();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('should call $disconnect on module destroy', async () => {
    await service.onModuleDestroy();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('should propagate connection errors from $connect', async () => {
    connectMock.mockRejectedValueOnce(new Error('DB unreachable'));
    await expect(service.onModuleInit()).rejects.toThrow('DB unreachable');
  });

  it('should propagate disconnection errors from $disconnect', async () => {
    disconnectMock.mockRejectedValueOnce(new Error('Disconnect failed'));
    await expect(service.onModuleDestroy()).rejects.toThrow('Disconnect failed');
  });

  it('should wrap tenant-scoped model reads in runWithRlsContext', async () => {
    const result = await requestContext.run({ tenant_id: 'tenant-1' }, () =>
      service.student.findMany({ where: { tenant_id: 'tenant-1' } }),
    );

    expect(runWithRlsContext).toHaveBeenCalledTimes(1);
    const [_prismaArg, contextArg, callbackArg] = (runWithRlsContext as jest.Mock).mock.calls[0]!;
    expect(contextArg).toEqual(expect.objectContaining({ tenant_id: 'tenant-1' }));
    expect(typeof callbackArg).toBe('function');
    expect(result).toEqual([{ id: 'student-1' }]);
  });

  it('should call the raw delegate when no tenant context exists', async () => {
    const rawFindMany = jest.fn().mockResolvedValue([{ id: 'raw-student' }]);

    Object.defineProperty(service, 'student', {
      configurable: true,
      value: { findMany: rawFindMany },
    });

    const result = await service.student.findMany({ where: { tenant_id: 'tenant-1' } });

    expect(rawFindMany).toHaveBeenCalledWith({ where: { tenant_id: 'tenant-1' } });
    expect(result).toEqual([{ id: 'raw-student' }]);
  });
});
