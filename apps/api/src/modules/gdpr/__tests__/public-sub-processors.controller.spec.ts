import { Test, TestingModule } from '@nestjs/testing';

import { PublicSubProcessorsController } from '../public-sub-processors.controller';
import { SubProcessorsService } from '../sub-processors.service';

describe('PublicSubProcessorsController', () => {
  let controller: PublicSubProcessorsController;
  const mockService = {
    getCurrentRegister: jest.fn(),
    getHistory: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicSubProcessorsController],
      providers: [{ provide: SubProcessorsService, useValue: mockService }],
    }).compile();

    controller = module.get<PublicSubProcessorsController>(PublicSubProcessorsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the current register and version history without auth dependencies', async () => {
    mockService.getCurrentRegister.mockResolvedValue({ version: '2026.03', entries: [] });
    mockService.getHistory.mockResolvedValue([{ version: '2026.03', entries: [] }]);

    const result = await controller.getCurrent();

    expect(result).toEqual({
      current_version: { version: '2026.03', entries: [] },
      history: [{ version: '2026.03', entries: [] }],
    });
    expect(mockService.getCurrentRegister).toHaveBeenCalledTimes(1);
    expect(mockService.getHistory).toHaveBeenCalledTimes(1);
  });
});
