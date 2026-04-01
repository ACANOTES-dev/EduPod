import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ImportTemplateService } from './import-template.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const IMPORT_ID = 'import-uuid-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'membership-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('ImportController', () => {
  let controller: ImportController;
  let mockImportService: {
    upload: jest.Mock;
    list: jest.Mock;
    get: jest.Mock;
    confirm: jest.Mock;
    rollback: jest.Mock;
  };
  let mockTemplateService: {
    generateTemplate: jest.Mock;
  };

  beforeEach(async () => {
    mockImportService = {
      upload: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      confirm: jest.fn(),
      rollback: jest.fn(),
    };
    mockTemplateService = {
      generateTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: mockImportService },
        { provide: ImportTemplateService, useValue: mockTemplateService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ImportController>(ImportController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('should upload a valid CSV file', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'students.csv',
        mimetype: 'text/csv',
        size: 1024,
      };
      const expected = { id: IMPORT_ID, status: 'pending' };
      mockImportService.upload.mockResolvedValue(expected);

      const result = await controller.upload(mockTenant, mockUser, file, {
        import_type: 'students',
      });

      expect(result).toEqual(expected);
      expect(mockImportService.upload).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        file.buffer,
        'students.csv',
        'students',
      );
    });

    it('should throw BadRequestException when no file is provided', async () => {
      await expect(
        controller.upload(mockTenant, mockUser, undefined, {
          import_type: 'students',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid file type', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'students.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };

      await expect(
        controller.upload(mockTenant, mockUser, file, {
          import_type: 'students',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file exceeds max size', async () => {
      const file = {
        buffer: Buffer.alloc(11 * 1024 * 1024),
        originalname: 'large.csv',
        mimetype: 'text/csv',
        size: 11 * 1024 * 1024,
      };

      await expect(
        controller.upload(mockTenant, mockUser, file, {
          import_type: 'students',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept xlsx file by extension even with generic mime', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'students.xlsx',
        mimetype: 'application/octet-stream',
        size: 1024,
      };
      mockImportService.upload.mockResolvedValue({ id: IMPORT_ID });

      const result = await controller.upload(mockTenant, mockUser, file, {
        import_type: 'students',
      });

      expect(result).toEqual({ id: IMPORT_ID });
    });
  });

  describe('list', () => {
    it('should list imports', async () => {
      const expected = {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      };
      mockImportService.list.mockResolvedValue(expected);

      const result = await controller.list(mockTenant, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual(expected);
    });
  });

  describe('get', () => {
    it('should get a single import by id', async () => {
      const expected = { id: IMPORT_ID, status: 'completed' };
      mockImportService.get.mockResolvedValue(expected);

      const result = await controller.get(mockTenant, IMPORT_ID);

      expect(result).toEqual(expected);
    });
  });

  describe('getTemplate', () => {
    it('should generate and send template', async () => {
      const templateBuffer = Buffer.from('xlsx-data');
      mockTemplateService.generateTemplate.mockResolvedValue(templateBuffer);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.getTemplate({ import_type: 'students' }, mockRes as never);

      expect(mockTemplateService.generateTemplate).toHaveBeenCalledWith('students');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.send).toHaveBeenCalledWith(templateBuffer);
    });
  });

  describe('confirm', () => {
    it('should confirm an import', async () => {
      const expected = { id: IMPORT_ID, status: 'confirmed' };
      mockImportService.confirm.mockResolvedValue(expected);

      const result = await controller.confirm(mockTenant, IMPORT_ID);

      expect(result).toEqual(expected);
    });
  });

  describe('rollback', () => {
    it('should rollback an import', async () => {
      const expected = { id: IMPORT_ID, status: 'rolled_back' };
      mockImportService.rollback.mockResolvedValue(expected);

      const result = await controller.rollback(mockTenant, IMPORT_ID);

      expect(result).toEqual(expected);
    });
  });
});
