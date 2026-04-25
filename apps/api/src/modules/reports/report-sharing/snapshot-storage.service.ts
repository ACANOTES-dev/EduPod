import { Injectable } from '@nestjs/common';

import { S3Service } from '../../s3/s3.service';

import type { ReportShareArtifactFormat } from './types';

const CONTENT_TYPES: Record<ReportShareArtifactFormat, string> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const PRESIGN_TTL_SECONDS = 15 * 60;

export interface SnapshotUploadInput {
  tenantId: string;
  shareId: string;
  format: ReportShareArtifactFormat;
  /**
   * Original (human-friendly) filename. Used to derive both the on-disk
   * key and the eventual `Content-Disposition` filename when the
   * recipient downloads the artifact. The key portion is sanitised to
   * `[A-Za-z0-9._-]`; the download filename is sanitised again by
   * `S3Service.getPresignedUrl` to ASCII-safe form.
   */
  filename: string;
  buffer: Buffer;
}

/**
 * SnapshotStorageService — thin wrapper around `S3Service` that owns the
 * per-share object key conventions and the 15-minute signed-URL TTL.
 *
 * Bucket layout (relative to the tenant root):
 *
 *     reports/shares/{share_id}/{sanitised-filename}
 *
 * The artifact lives indefinitely for v1; a 90-day lifecycle cleanup
 * job is a deferred follow-up (impl 13 spec §7).
 */
@Injectable()
export class SnapshotStorageService {
  constructor(private readonly s3: S3Service) {}

  async upload(input: SnapshotUploadInput): Promise<string> {
    const safeName = sanitiseObjectKeyPart(input.filename);
    const key = `reports/shares/${input.shareId}/${safeName}`;
    return this.s3.upload(input.tenantId, key, input.buffer, CONTENT_TYPES[input.format]);
  }

  /**
   * Build a 15-minute signed URL for a previously-uploaded artifact. The
   * download filename is supplied separately so the recipient sees a
   * friendly name rather than the storage key.
   */
  async getDownloadUrl(storageKey: string, downloadFilename: string): Promise<string> {
    return this.s3.getPresignedUrl(storageKey, PRESIGN_TTL_SECONDS, {
      downloadFilename,
    });
  }
}

/**
 * Make a filename safe for use as the trailing segment of an S3 object
 * key: keep `[A-Za-z0-9._-]`, collapse the rest to `-`, and trim. Empty
 * or all-stripped inputs fall back to a generic placeholder.
 */
function sanitiseObjectKeyPart(name: string): string {
  const trimmed = name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  return trimmed || 'artifact';
}
