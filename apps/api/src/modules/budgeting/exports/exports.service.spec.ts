import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

import { ExportsService } from './exports.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT_ID = '33333333-3333-4333-8333-333333333333';

describe('ExportsService — serveSnapshotArtifact', () => {
  let service: ExportsService;
  let prisma: { financialModelSnapshot: { findFirst: jest.Mock } };
  let queue: { add: jest.Mock };
  let s3: { getPresignedUrl: jest.Mock };

  beforeEach(async () => {
    prisma = { financialModelSnapshot: { findFirst: jest.fn() } };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    s3 = { getPresignedUrl: jest.fn().mockResolvedValue('https://signed/url') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: getQueueToken('budgeting'), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(ExportsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns rendered + signed URL when pdf_object_key is set', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      pdf_object_key: 'tenants/A/key.pdf',
      excel_object_key: null,
      rendered_at: new Date(),
    });
    const out = await service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf');
    expect(out.status).toBe('rendered');
    expect(out.signed_url).toBe('https://signed/url');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns rendered + signed URL when excel_object_key is set', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      pdf_object_key: null,
      excel_object_key: 'tenants/A/key.xlsx',
      rendered_at: new Date(),
    });
    const out = await service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'excel');
    expect(out.status).toBe('rendered');
    expect(s3.getPresignedUrl).toHaveBeenCalledWith(
      'tenants/A/key.xlsx',
      expect.any(Number),
      expect.objectContaining({ downloadFilename: 'board-pack.xlsx' }),
    );
  });

  it('enqueues render and returns pending when key is missing', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({
      id: SNAPSHOT_ID,
      pdf_object_key: null,
      excel_object_key: null,
      rendered_at: null,
    });
    const out = await service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf');
    expect(out.status).toBe('pending');
    expect(out.job_id).toBe('job-1');
    expect(queue.add).toHaveBeenCalledWith(
      'budgeting:board-pack-render',
      { tenant_id: TENANT_A, snapshot_id: SNAPSHOT_ID, format: 'pdf' },
      expect.any(Object),
    );
  });

  it('throws NotFoundException when snapshot does not belong to tenant', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
    await expect(
      service.serveSnapshotArtifact(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExportsService — enqueueBoardPackRender', () => {
  let service: ExportsService;
  let prisma: { financialModelSnapshot: { findFirst: jest.Mock } };
  let queue: { add: jest.Mock };
  let s3: { getPresignedUrl: jest.Mock };

  beforeEach(async () => {
    prisma = { financialModelSnapshot: { findFirst: jest.fn() } };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-42' }) };
    s3 = { getPresignedUrl: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: getQueueToken('budgeting'), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(ExportsService);
  });

  it('returns job id and enqueues with format=all', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue({ id: SNAPSHOT_ID });
    const id = await service.enqueueBoardPackRender(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'all');
    expect(id).toBe('job-42');
    expect(queue.add).toHaveBeenCalledWith(
      'budgeting:board-pack-render',
      { tenant_id: TENANT_A, snapshot_id: SNAPSHOT_ID, format: 'all' },
      expect.any(Object),
    );
  });

  it('throws NotFoundException for cross-tenant snapshot', async () => {
    prisma.financialModelSnapshot.findFirst.mockResolvedValue(null);
    await expect(
      service.enqueueBoardPackRender(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'all'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
