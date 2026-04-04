import { BadRequestException } from '@nestjs/common';

import { createFileInterceptor, FILE_UPLOAD_PRESETS } from './file-upload.interceptor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the multer options passed to FileInterceptor by inspecting the mock.
 * Returns { fieldName, multerOptions }.
 */
function getLastCallArgs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FileInterceptor } = require('@nestjs/platform-express') as {
    FileInterceptor: jest.Mock;
  };
  const lastCall = FileInterceptor.mock.calls[FileInterceptor.mock.calls.length - 1];
  return {
    fieldName: lastCall[0] as string,
    multerOptions: lastCall[1] as Record<string, unknown>,
  };
}

// ─── Mock NestJS FileInterceptor ──────────────────────────────────────────────

jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: jest.fn(() => {
    class MockInterceptor {}
    return MockInterceptor;
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FILE_UPLOAD_PRESETS', () => {
  afterEach(() => jest.clearAllMocks());

  describe('IMAGE', () => {
    it('should include jpeg, png, gif, webp, and svg+xml MIME types', () => {
      expect(FILE_UPLOAD_PRESETS.IMAGE).toEqual(
        expect.arrayContaining([
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml',
        ]),
      );
      expect(FILE_UPLOAD_PRESETS.IMAGE).toHaveLength(5);
    });
  });

  describe('CSV', () => {
    it('should include text/csv, application/csv, and text/comma-separated-values', () => {
      expect(FILE_UPLOAD_PRESETS.CSV).toEqual(
        expect.arrayContaining(['text/csv', 'application/csv', 'text/comma-separated-values']),
      );
      expect(FILE_UPLOAD_PRESETS.CSV).toHaveLength(3);
    });
  });

  describe('SPREADSHEET', () => {
    it('should include all CSV types plus Excel MIME types', () => {
      expect(FILE_UPLOAD_PRESETS.SPREADSHEET).toEqual(
        expect.arrayContaining([
          'text/csv',
          'application/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]),
      );
      expect(FILE_UPLOAD_PRESETS.SPREADSHEET).toHaveLength(5);
    });
  });

  describe('DOCUMENT', () => {
    it('should include all IMAGE types plus pdf, msword, and docx', () => {
      expect(FILE_UPLOAD_PRESETS.DOCUMENT).toEqual(
        expect.arrayContaining([
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]),
      );
      expect(FILE_UPLOAD_PRESETS.DOCUMENT).toHaveLength(8);
    });
  });
});

describe('createFileInterceptor', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return a class (the interceptor)', () => {
    const Interceptor = createFileInterceptor({
      allowedMimes: FILE_UPLOAD_PRESETS.IMAGE,
    });
    expect(typeof Interceptor).toBe('function');
  });

  it('should default fieldName to "file"', () => {
    createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.IMAGE });
    const { fieldName } = getLastCallArgs();
    expect(fieldName).toBe('file');
  });

  it('should default maxSizeMb to 10 (10 MB in bytes)', () => {
    createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.IMAGE });
    const { multerOptions } = getLastCallArgs();
    const limits = multerOptions.limits as { fileSize: number };
    expect(limits.fileSize).toBe(10 * 1024 * 1024);
  });

  it('should use a custom fieldName when provided', () => {
    createFileInterceptor({
      fieldName: 'avatar',
      allowedMimes: FILE_UPLOAD_PRESETS.IMAGE,
    });
    const { fieldName } = getLastCallArgs();
    expect(fieldName).toBe('avatar');
  });

  it('should use a custom maxSizeMb when provided', () => {
    createFileInterceptor({
      maxSizeMb: 25,
      allowedMimes: FILE_UPLOAD_PRESETS.CSV,
    });
    const { multerOptions } = getLastCallArgs();
    const limits = multerOptions.limits as { fileSize: number };
    expect(limits.fileSize).toBe(25 * 1024 * 1024);
  });

  it('should respect both custom fieldName and maxSizeMb together', () => {
    createFileInterceptor({
      fieldName: 'document',
      maxSizeMb: 50,
      allowedMimes: FILE_UPLOAD_PRESETS.DOCUMENT,
    });
    const { fieldName, multerOptions } = getLastCallArgs();
    const limits = multerOptions.limits as { fileSize: number };
    expect(fieldName).toBe('document');
    expect(limits.fileSize).toBe(50 * 1024 * 1024);
  });

  describe('fileFilter callback', () => {
    function getFileFilter(): (
      req: unknown,
      file: { mimetype: string },
      cb: (error: Error | null, accept: boolean) => void,
    ) => void {
      const { multerOptions } = getLastCallArgs();
      return multerOptions.fileFilter as (
        req: unknown,
        file: { mimetype: string },
        cb: (error: Error | null, accept: boolean) => void,
      ) => void;
    }

    it('should accept a file whose MIME type is in allowedMimes', () => {
      createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.IMAGE });
      const fileFilter = getFileFilter();

      const cb = jest.fn();
      fileFilter({}, { mimetype: 'image/png' }, cb);

      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject a file whose MIME type is not in allowedMimes with BadRequestException', () => {
      createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.IMAGE });
      const fileFilter = getFileFilter();

      const cb = jest.fn();
      fileFilter({}, { mimetype: 'application/pdf' }, cb);

      expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    });

    it('should include the rejected MIME type and allowed types in the error message', () => {
      createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.CSV });
      const fileFilter = getFileFilter();

      const cb = jest.fn();
      fileFilter({}, { mimetype: 'text/plain' }, cb);

      const error = cb.mock.calls[0][0] as BadRequestException;
      const response = error.getResponse() as { error: { code: string; message: string } };

      expect(response.error.code).toBe('INVALID_FILE_TYPE');
      expect(response.error.message).toContain('text/plain');
      expect(response.error.message).toContain('text/csv');
    });
  });
});
