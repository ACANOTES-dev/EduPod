import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import type { TenantContext } from '@school/shared';

import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'UTC',
};

function buildResponse(): jest.Mocked<Response> {
  const res = {} as jest.Mocked<Response>;
  res.redirect = jest.fn() as unknown as Response['redirect'];
  res.status = jest.fn().mockReturnThis() as unknown as Response['status'];
  res.json = jest.fn().mockReturnThis() as unknown as Response['json'];
  return res;
}

describe('ExportsController', () => {
  let controller: ExportsController;
  let service: jest.Mocked<ExportsService>;

  beforeEach(() => {
    service = {
      serveSnapshotArtifact: jest.fn(),
      enqueueBoardPackRender: jest.fn(),
    } as unknown as jest.Mocked<ExportsService>;

    controller = new ExportsController(service);
  });

  describe('GET …/exports/pdf', () => {
    it('redirects to the signed URL when the artefact is rendered', async () => {
      service.serveSnapshotArtifact.mockResolvedValue({
        status: 'rendered',
        signed_url: 'https://signed.example/board.pdf',
        job_id: undefined,
      });
      const res = buildResponse();
      await controller.getPdf(TENANT, MODEL_ID, SNAPSHOT_ID, res);
      expect(service.serveSnapshotArtifact).toHaveBeenCalledWith(
        TENANT_ID,
        MODEL_ID,
        SNAPSHOT_ID,
        'pdf',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        HttpStatus.FOUND,
        'https://signed.example/board.pdf',
      );
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 202 with the in-flight job_id when render is still pending', async () => {
      service.serveSnapshotArtifact.mockResolvedValue({
        status: 'rendering',
        signed_url: undefined,
        job_id: 'job-123',
      });
      const res = buildResponse();
      await controller.getPdf(TENANT, MODEL_ID, SNAPSHOT_ID, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rendering', job_id: 'job-123' }),
      );
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('GET …/exports/excel', () => {
    it('redirects to the signed URL when ready', async () => {
      service.serveSnapshotArtifact.mockResolvedValue({
        status: 'rendered',
        signed_url: 'https://signed.example/board.xlsx',
        job_id: undefined,
      });
      const res = buildResponse();
      await controller.getExcel(TENANT, MODEL_ID, SNAPSHOT_ID, res);
      expect(service.serveSnapshotArtifact).toHaveBeenCalledWith(
        TENANT_ID,
        MODEL_ID,
        SNAPSHOT_ID,
        'excel',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        HttpStatus.FOUND,
        'https://signed.example/board.xlsx',
      );
    });

    it('returns 202 with job_id when still rendering', async () => {
      service.serveSnapshotArtifact.mockResolvedValue({
        status: 'rendering',
        signed_url: undefined,
        job_id: 'job-456',
      });
      const res = buildResponse();
      await controller.getExcel(TENANT, MODEL_ID, SNAPSHOT_ID, res);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rendering', job_id: 'job-456' }),
      );
    });
  });

  describe('POST …/exports/regenerate', () => {
    it('enqueues a board-pack render and returns the job_id', async () => {
      service.enqueueBoardPackRender.mockResolvedValue('job-789');
      const result = await controller.regenerate(TENANT, MODEL_ID, SNAPSHOT_ID);
      expect(service.enqueueBoardPackRender).toHaveBeenCalledWith(
        TENANT_ID,
        MODEL_ID,
        SNAPSHOT_ID,
        'all',
      );
      expect(result).toEqual({ job_id: 'job-789', status: 'enqueued' });
    });
  });
});
