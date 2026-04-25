import { Test, type TestingModule } from '@nestjs/testing';

import { S3Service } from '../../s3/s3.service';

import { SnapshotStorageService } from './snapshot-storage.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SHARE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('SnapshotStorageService', () => {
  let service: SnapshotStorageService;
  let s3: { upload: jest.Mock; getPresignedUrl: jest.Mock };

  beforeEach(async () => {
    s3 = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SnapshotStorageService, { provide: S3Service, useValue: s3 }],
    }).compile();

    service = module.get<SnapshotStorageService>(SnapshotStorageService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('uploads under the per-share prefix and returns the storage key', async () => {
      s3.upload.mockResolvedValueOnce(
        `${TENANT_ID}/reports/shares/${SHARE_ID}/report.pdf`,
      );

      const buf = Buffer.from('fake pdf bytes');
      const key = await service.upload({
        tenantId: TENANT_ID,
        shareId: SHARE_ID,
        format: 'pdf',
        filename: 'report.pdf',
        buffer: buf,
      });

      expect(s3.upload).toHaveBeenCalledTimes(1);
      const [tenantArg, keyArg, bodyArg, contentTypeArg] = s3.upload.mock.calls[0] as [
        string,
        string,
        Buffer,
        string,
      ];
      expect(tenantArg).toBe(TENANT_ID);
      expect(keyArg).toBe(`reports/shares/${SHARE_ID}/report.pdf`);
      expect(bodyArg).toBe(buf);
      expect(contentTypeArg).toBe('application/pdf');
      expect(key).toBe(`${TENANT_ID}/reports/shares/${SHARE_ID}/report.pdf`);
    });

    it('picks the correct content type for excel and word', async () => {
      s3.upload.mockResolvedValue('any-key');

      await service.upload({
        tenantId: TENANT_ID,
        shareId: SHARE_ID,
        format: 'excel',
        filename: 'report.xlsx',
        buffer: Buffer.from('xlsx'),
      });
      const excelCt = (s3.upload.mock.calls[0] as unknown[])[3];
      expect(excelCt).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      s3.upload.mockClear();
      await service.upload({
        tenantId: TENANT_ID,
        shareId: SHARE_ID,
        format: 'word',
        filename: 'report.docx',
        buffer: Buffer.from('docx'),
      });
      const wordCt = (s3.upload.mock.calls[0] as unknown[])[3];
      expect(wordCt).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
    });

    it('sanitises the filename portion of the storage key', async () => {
      s3.upload.mockResolvedValue('any-key');

      await service.upload({
        tenantId: TENANT_ID,
        shareId: SHARE_ID,
        format: 'pdf',
        filename: 'my report w/ slash & weird chars.pdf',
        buffer: Buffer.from('pdf'),
      });

      const keyArg = (s3.upload.mock.calls[0] as unknown[])[1] as string;
      expect(keyArg.startsWith(`reports/shares/${SHARE_ID}/`)).toBe(true);
      expect(keyArg.endsWith('.pdf')).toBe(true);
      // Trailing filename segment should not retain the `/` or `&` from the
      // original input — both have been collapsed to `-`.
      const filenameSegment = keyArg.split('/').pop() ?? '';
      expect(filenameSegment).not.toMatch(/[/&]/);
      expect(filenameSegment).toMatch(/^my-report-w-slash-weird-chars\.pdf$/);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a 15-min signed URL with attachment Content-Disposition', async () => {
      s3.getPresignedUrl.mockResolvedValue('https://example.test/signed');

      const url = await service.getDownloadUrl(
        `${TENANT_ID}/reports/shares/${SHARE_ID}/report.pdf`,
        'My Report.pdf',
      );

      expect(url).toBe('https://example.test/signed');
      expect(s3.getPresignedUrl).toHaveBeenCalledWith(
        `${TENANT_ID}/reports/shares/${SHARE_ID}/report.pdf`,
        15 * 60,
        { downloadFilename: 'My Report.pdf' },
      );
    });
  });
});
