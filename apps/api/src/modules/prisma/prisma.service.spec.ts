import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // Stub the underlying PrismaClient methods so we never touch a real DB
    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call $connect on module init', async () => {
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalledTimes(1);
  });

  it('should call $disconnect on module destroy', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('should propagate connection errors from $connect', async () => {
    (service.$connect as jest.Mock).mockRejectedValueOnce(new Error('DB unreachable'));
    await expect(service.onModuleInit()).rejects.toThrow('DB unreachable');
  });

  it('should propagate disconnection errors from $disconnect', async () => {
    (service.$disconnect as jest.Mock).mockRejectedValueOnce(new Error('Disconnect failed'));
    await expect(service.onModuleDestroy()).rejects.toThrow('Disconnect failed');
  });
});
