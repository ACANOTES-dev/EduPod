/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';

import { SavedReportDraftController } from './saved-report-draft.controller';
import { SavedReportDraftService } from './saved-report-draft.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const tenant = { tenant_id: TENANT_ID } as unknown as Parameters<
  SavedReportDraftController['get']
>[0];
const user = { sub: USER_ID } as unknown as Parameters<SavedReportDraftController['get']>[1];

describe('SavedReportDraftController', () => {
  let controller: SavedReportDraftController;
  const service = {
    get: jest.fn(),
    upsert: jest.fn(),
    clear: jest.fn(),
  };

  beforeEach(async () => {
    service.get.mockReset();
    service.upsert.mockReset();
    service.clear.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavedReportDraftController],
      providers: [{ provide: SavedReportDraftService, useValue: service }],
    })
      .overrideGuard(require('../../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SavedReportDraftController);
  });

  it('returns a draft when one exists', async () => {
    const draft = { id: 'd-1', subject_key: 'student' };
    service.get.mockResolvedValue(draft);

    const res = { status: jest.fn() } as unknown as Response;
    const result = await controller.get(tenant, user, res);

    expect(service.get).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(draft);
  });

  it('sets status 204 when no draft exists', async () => {
    service.get.mockResolvedValue(null);

    const status = jest.fn();
    const res = { status } as unknown as Response;
    const result = await controller.get(tenant, user, res);

    expect(status).toHaveBeenCalledWith(204);
    expect(result).toBeUndefined();
  });

  it('upserts the draft with the parsed body', async () => {
    service.upsert.mockResolvedValue({ id: 'd-1' });

    const body = {
      subject_key: 'student' as const,
      columns_json: { field_ids: ['student.identity.first_name'] },
      filters_json: { combinator: 'and' as const, filters: [] },
    };
    await controller.upsert(tenant, user, body);

    expect(service.upsert).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
  });

  it('clears the draft', async () => {
    service.clear.mockResolvedValue(undefined);
    await controller.clear(tenant, user);
    expect(service.clear).toHaveBeenCalledWith(TENANT_ID, USER_ID);
  });
});
