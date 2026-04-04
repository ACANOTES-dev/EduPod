import { Injectable } from '@nestjs/common';

import { AttendanceBulkUploadService } from './attendance-bulk-upload.service';
import { AttendanceExceptionsService } from './attendance-exceptions.service';
import type { QuickMarkEntry } from './attendance-file-parser.service';
import { AttendanceFileParserService } from './attendance-file-parser.service';

// ─── Types (re-exported for consumers) ──────────────────────────────────────

export interface UploadValidationError {
  row: number;
  field: string;
  message: string;
}

export interface UploadValidationFailure {
  valid: false;
  errors: UploadValidationError[];
  total_rows: number;
  valid_rows: number;
}

export interface UploadSuccess {
  valid: true;
  sessions_created: number;
  records_created: number;
}

export interface ExceptionsUploadResult {
  success: boolean;
  updated: number;
  errors: Array<{ row: number; error: string }>;
  batch_id: string;
}

export type { QuickMarkEntry };

// ─── Facade ─────────────────────────────────────────────────────────────────

/**
 * Thin facade that delegates to specialised sub-services.
 * Preserves the original public API so that the controller and tests
 * continue to inject `AttendanceUploadService` without changes.
 */
@Injectable()
export class AttendanceUploadService {
  constructor(
    private readonly fileParser: AttendanceFileParserService,
    private readonly bulkUpload: AttendanceBulkUploadService,
    private readonly exceptions: AttendanceExceptionsService,
  ) {}

  // ─── Template Generation ────────────────────────────────────────────────

  async generateTemplate(tenantId: string, sessionDate: string): Promise<string> {
    return this.bulkUpload.generateTemplate(tenantId, sessionDate);
  }

  // ─── File Upload Processing ─────────────────────────────────────────────

  async processUpload(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    sessionDate: string,
  ): Promise<UploadValidationFailure | UploadSuccess> {
    return this.bulkUpload.processUpload(tenantId, userId, fileBuffer, originalName, sessionDate);
  }

  // ─── Quick-Mark Text Parser ─────────────────────────────────────────────

  parseQuickMarkText(text: string): QuickMarkEntry[] {
    return this.fileParser.parseQuickMarkText(text);
  }

  // ─── Exceptions-Only Upload ────────────────────────────────────────────

  async processExceptionsUpload(
    tenantId: string,
    userId: string,
    sessionDate: string,
    entries: Array<{ student_number: string; status: string; reason?: string }>,
  ): Promise<ExceptionsUploadResult> {
    return this.exceptions.processExceptionsUpload(tenantId, userId, sessionDate, entries);
  }

  // ─── Undo Upload ──────────────────────────────────────────────────────

  async undoUpload(
    tenantId: string,
    userId: string,
    batchId: string,
  ): Promise<{ reverted: number }> {
    return this.exceptions.undoUpload(tenantId, userId, batchId);
  }
}
