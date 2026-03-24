import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';

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
      .overrideGuard(AuthGuard).useValue(mockGuard)
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  afterEach(() => jest.clearAllMocks());

  const tenantContext = { tenant_id: TENANT_ID };

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

    it('should handle empty query string', async () => {
      const searchResponse = { results: [], total: 0 };
      mockService.search.mockResolvedValue(searchResponse);

      const query = { q: '', page: 1, pageSize: 20 };
      await controller.search(tenantContext, query);

      expect(mockService.search).toHaveBeenCalledWith(
        TENANT_ID,
        '',
        ['students', 'parents', 'staff', 'households'],
        1,
        20,
      );
    });
  });
});
