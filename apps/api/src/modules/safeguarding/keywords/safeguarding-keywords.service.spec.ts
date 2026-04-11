import { ConflictException, NotFoundException } from '@nestjs/common';

import type { SafeguardingKeywordRow } from './safeguarding-keywords.repository';
import { SafeguardingKeywordsService } from './safeguarding-keywords.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const KEYWORD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeRow(overrides: Partial<SafeguardingKeywordRow> = {}): SafeguardingKeywordRow {
  return {
    id: KEYWORD_ID,
    tenant_id: TENANT_ID,
    keyword: 'bully',
    severity: 'medium',
    category: 'bullying',
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('SafeguardingKeywordsService', () => {
  let repo: {
    listAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setActive: jest.Mock;
    delete: jest.Mock;
    bulkImport: jest.Mock;
  };
  let service: SafeguardingKeywordsService;

  beforeEach(() => {
    repo = {
      listAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      delete: jest.fn(),
      bulkImport: jest.fn(),
    };
    service = new SafeguardingKeywordsService(repo as never);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('delegates to repo.listAll', async () => {
      repo.listAll.mockResolvedValue([makeRow()]);
      const result = await service.list(TENANT_ID);
      expect(repo.listAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('returns the created row', async () => {
      repo.create.mockResolvedValue(makeRow());
      const result = await service.create(TENANT_ID, {
        keyword: 'bully',
        severity: 'medium',
        category: 'bullying',
      });
      expect(result.keyword).toBe('bully');
    });

    it('rethrows P2002 as ConflictException', async () => {
      repo.create.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.create(TENANT_ID, {
          keyword: 'bully',
          severity: 'medium',
          category: 'bullying',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates non-unique errors unchanged', async () => {
      repo.create.mockRejectedValue(new Error('boom'));
      await expect(
        service.create(TENANT_ID, {
          keyword: 'bully',
          severity: 'medium',
          category: 'bullying',
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the keyword does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update(TENANT_ID, KEYWORD_ID, { severity: 'high' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates when the keyword exists', async () => {
      repo.findById.mockResolvedValue(makeRow());
      repo.update.mockResolvedValue(makeRow({ severity: 'high' }));
      const result = await service.update(TENANT_ID, KEYWORD_ID, { severity: 'high' });
      expect(result.severity).toBe('high');
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, KEYWORD_ID, { severity: 'high' });
    });
  });

  describe('setActive', () => {
    it('throws NotFoundException when the keyword does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.setActive(TENANT_ID, KEYWORD_ID, false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.setActive).not.toHaveBeenCalled();
    });

    it('toggles when the keyword exists', async () => {
      repo.findById.mockResolvedValue(makeRow());
      await service.setActive(TENANT_ID, KEYWORD_ID, false);
      expect(repo.setActive).toHaveBeenCalledWith(TENANT_ID, KEYWORD_ID, false);
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when the keyword does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.delete(TENANT_ID, KEYWORD_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes when the keyword exists', async () => {
      repo.findById.mockResolvedValue(makeRow());
      await service.delete(TENANT_ID, KEYWORD_ID);
      expect(repo.delete).toHaveBeenCalledWith(TENANT_ID, KEYWORD_ID);
    });
  });

  describe('bulkImport', () => {
    it('delegates to repo.bulkImport and returns the counts', async () => {
      repo.bulkImport.mockResolvedValue({ imported: 4, skipped: 2 });
      const result = await service.bulkImport(TENANT_ID, [
        { keyword: 'one', severity: 'low', category: 'other' },
        { keyword: 'two', severity: 'medium', category: 'other' },
      ]);
      expect(result).toEqual({ imported: 4, skipped: 2 });
      expect(repo.bulkImport).toHaveBeenCalledWith(TENANT_ID, [
        { keyword: 'one', severity: 'low', category: 'other' },
        { keyword: 'two', severity: 'medium', category: 'other' },
      ]);
    });
  });
});
