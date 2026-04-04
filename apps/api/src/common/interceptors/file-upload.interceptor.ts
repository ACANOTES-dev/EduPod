import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { apiError } from '../errors/api-error';

// ─── MIME type presets ────────────────────────────────────────────────────────

const IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

const CSV_MIMES = ['text/csv', 'application/csv', 'text/comma-separated-values'] as const;

const SPREADSHEET_MIMES = [
  ...CSV_MIMES,
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const DOCUMENT_MIMES = [
  ...IMAGE_MIMES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const FILE_UPLOAD_PRESETS = {
  IMAGE: IMAGE_MIMES as unknown as readonly string[],
  CSV: CSV_MIMES as unknown as readonly string[],
  SPREADSHEET: SPREADSHEET_MIMES as unknown as readonly string[],
  DOCUMENT: DOCUMENT_MIMES as unknown as readonly string[],
} as const;

// ─── Factory ──────────────────────────────────────────────────────────────────

interface FileUploadOptions {
  fieldName?: string;
  maxSizeMb?: number;
  allowedMimes: readonly string[];
}

/**
 * Creates a FileInterceptor with enforced size limits and MIME type filtering.
 * Rejects disallowed types with 400 and oversized files with 413.
 */
export function createFileInterceptor(options: FileUploadOptions) {
  const { fieldName = 'file', maxSizeMb = 10, allowedMimes } = options;

  const multerOptions: MulterOptions = {
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (
      _req: unknown,
      file: { mimetype: string },
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            apiError(
              'INVALID_FILE_TYPE',
              `File type "${file.mimetype}" is not allowed. Accepted: ${allowedMimes.join(', ')}`,
            ),
          ),
          false,
        );
      }
    },
  };

  return FileInterceptor(fieldName, multerOptions);
}
