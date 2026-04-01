import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { ImportType } from '@school/shared';

import { ImportTemplateService } from './import-template.service';

describe('ImportTemplateService', () => {
  let service: ImportTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportTemplateService],
    }).compile();

    service = module.get<ImportTemplateService>(ImportTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateTemplate', () => {
    it('should generate a valid XLSX buffer for students import type', async () => {
      const buffer = await service.generateTemplate('students');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate a valid XLSX buffer for staff import type', async () => {
      const buffer = await service.generateTemplate('staff');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate a valid XLSX buffer for parents import type', async () => {
      const buffer = await service.generateTemplate('parents');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate a valid XLSX buffer for fees import type', async () => {
      const buffer = await service.generateTemplate('fees');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate a valid XLSX buffer for exam_results import type', async () => {
      const buffer = await service.generateTemplate('exam_results');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate a valid XLSX buffer for staff_compensation import type', async () => {
      const buffer = await service.generateTemplate('staff_compensation');

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should throw BadRequestException for an invalid import type', async () => {
      await expect(service.generateTemplate('invalid_type' as ImportType)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should produce a buffer that starts with xlsx magic bytes (PK zip header)', async () => {
      const buffer = await service.generateTemplate('students');

      // XLSX files are ZIP archives starting with PK (0x50, 0x4B)
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);
    });
  });
});
