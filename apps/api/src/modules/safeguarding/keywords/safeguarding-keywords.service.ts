import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  CreateSafeguardingKeywordDto,
  UpdateSafeguardingKeywordDto,
} from '@school/shared/inbox';

import {
  SafeguardingKeywordRow,
  SafeguardingKeywordsRepository,
} from './safeguarding-keywords.repository';

@Injectable()
export class SafeguardingKeywordsService {
  constructor(private readonly repo: SafeguardingKeywordsRepository) {}

  async list(tenantId: string): Promise<SafeguardingKeywordRow[]> {
    return this.repo.listAll(tenantId);
  }

  async create(
    tenantId: string,
    dto: CreateSafeguardingKeywordDto,
  ): Promise<SafeguardingKeywordRow> {
    try {
      return await this.repo.create(tenantId, dto);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({
          code: 'SAFEGUARDING_KEYWORD_DUPLICATE',
          message: `A keyword with text "${dto.keyword}" already exists for this tenant.`,
        });
      }
      throw err;
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSafeguardingKeywordDto,
  ): Promise<SafeguardingKeywordRow> {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundException({
        code: 'SAFEGUARDING_KEYWORD_NOT_FOUND',
        message: `Safeguarding keyword with id "${id}" not found`,
      });
    }

    try {
      return await this.repo.update(tenantId, id, dto);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({
          code: 'SAFEGUARDING_KEYWORD_DUPLICATE',
          message: `A keyword with that text already exists for this tenant.`,
        });
      }
      throw err;
    }
  }

  async setActive(tenantId: string, id: string, active: boolean): Promise<void> {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundException({
        code: 'SAFEGUARDING_KEYWORD_NOT_FOUND',
        message: `Safeguarding keyword with id "${id}" not found`,
      });
    }
    await this.repo.setActive(tenantId, id, active);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundException({
        code: 'SAFEGUARDING_KEYWORD_NOT_FOUND',
        message: `Safeguarding keyword with id "${id}" not found`,
      });
    }
    await this.repo.delete(tenantId, id);
  }

  async bulkImport(
    tenantId: string,
    keywords: CreateSafeguardingKeywordDto[],
  ): Promise<{ imported: number; skipped: number }> {
    return this.repo.bulkImport(tenantId, keywords);
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
