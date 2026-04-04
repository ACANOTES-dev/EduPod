import { BadRequestException, CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockGuard: CanActivate = { canActivate: () => true };

describe('SearchController', () => {
  let controller: SearchController;
  let mockService: {
    search: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      search: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  afterEach(() => jest.clearAllMocks());

  const tenantContext = { tenant_id: TENANT_ID };

  // ─── Guard & permission metadata verification ──────────────────────────────

  it('should have AuthGuard and PermissionGuard applied at class level', () => {
    const guards = Reflect.getMetadata('__guards__', SearchController);
    expect(guards).toBeDefined();
    expect(guards).toContain(AuthGuard);
    expect(guards).toContain(PermissionGuard);
  });

  it('should have @RequiresPermission("search.view") on the search handler', () => {
    const permission = Reflect.getMetadata(
      REQUIRES_PERMISSION_KEY,
      SearchController.prototype.search,
    );
    expect(permission).toBe('search.view');
  });

  // ─── search() ──────────────────────────────────────────────────────────────

  describe('search()', () => {
    it('should call searchService.search with default types when types not specified', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'test', page: 1, pageSize: 20 };
      const result = await controller.search(tenantContext, query);

      expect(mockService.search).toHaveBeenCalledWith(
        TENANT_ID,
        'test',
        ['students', 'parents', 'staff', 'households'],
        1,
        20,
      );
      expect(result).toEqual({ data: searchResponse });
    });

    it('should parse comma-separated types when provided', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'John', types: 'students,staff', page: 1, pageSize: 20 };
      await controller.search(tenantContext, query);

      expect(mockService.search).toHaveBeenCalledWith(
        TENANT_ID,
        'John',
        ['students', 'staff'],
        1,
        20,
      );
    });

    it('should return search results wrapped in data object', async () => {
      const searchResponse = {
        results: [
          {
            entity_type: 'students',
            id: 'stu-1',
            primary_label: 'John Doe',
            secondary_label: 'Year 10',
            status: 'active',
            highlight: 'John',
          },
        ],
        total: 1,
      };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'John', page: 1, pageSize: 20 };
      const result = await controller.search(tenantContext, query);

      expect(result).toEqual({ data: searchResponse });
    });

    it('should throw BadRequestException for blank query', async () => {
      const query = { q: '', page: 1, pageSize: 20 };

      await expect(controller.search(tenantContext, query)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      const query = { q: '   ', page: 1, pageSize: 20 };

      await expect(controller.search(tenantContext, query)).rejects.toThrow(BadRequestException);
    });

    it('should include BLANK_QUERY_NOT_ALLOWED error code for empty query', async () => {
      const query = { q: '', page: 1, pageSize: 20 };

      try {
        await controller.search(tenantContext, query);
        fail('Expected BadRequestException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse();
        expect(response).toEqual({
          error: {
            code: 'BLANK_QUERY_NOT_ALLOWED',
            message: 'Search query must not be empty',
          },
        });
      }
    });

    // ─── 2E.3 regression: additional edge-case tests ──────────────────────────

    it('should reject whitespace-only query with tabs and newlines', async () => {
      const query = { q: ' \t\n ', page: 1, pageSize: 20 };

      try {
        await controller.search(tenantContext, query);
        fail('Expected BadRequestException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse();
        expect(response).toEqual({
          error: {
            code: 'BLANK_QUERY_NOT_ALLOWED',
            message: 'Search query must not be empty',
          },
        });
      }
    });

    it('should succeed with a single-character query (edge boundary)', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'a', page: 1, pageSize: 20 };
      const result = await controller.search(tenantContext, query);

      expect(mockService.search).toHaveBeenCalledWith(
        TENANT_ID,
        'a',
        ['students', 'parents', 'staff', 'households'],
        1,
        20,
      );
      expect(result).toEqual({ data: searchResponse });
    });

    it('should filter to empty array when types is comma-only (no valid segments)', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'test', types: ',', page: 1, pageSize: 20 };
      const result = await controller.search(tenantContext, query);

      // ',' splits to ['', ''], filter(Boolean) removes empties → []
      expect(mockService.search).toHaveBeenCalledWith(TENANT_ID, 'test', [], 1, 20);
      expect(result).toEqual({ data: searchResponse });
    });

    it('should trim whitespace from types values', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: 'test', types: ' students , staff ', page: 1, pageSize: 20 };
      const result = await controller.search(tenantContext, query);

      expect(mockService.search).toHaveBeenCalledWith(
        TENANT_ID,
        'test',
        ['students', 'staff'],
        1,
        20,
      );
      expect(result).toEqual({ data: searchResponse });
    });
  });
});
