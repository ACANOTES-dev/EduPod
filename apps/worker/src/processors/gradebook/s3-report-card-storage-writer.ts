import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ReportCardStorageWriter } from './report-card-generation.processor';

/**
 * Production S3 binding for {@link ReportCardStorageWriter}. Mirrors
 * `apps/api/src/modules/s3/s3.service.ts` so upload/delete semantics are
 * identical on both sides of the API/worker split — the key is namespaced
 * under the tenant id and written with an explicit `application/pdf`
 * content type so browsers render the object inline.
 *
 * This replaces the `NullReportCardStorageWriter` that was previously bound
 * in `worker.module.ts`. The null writer was a leftover from impl 04 that
 * returned a fabricated storage key without actually uploading anything,
 * which caused every presigned download URL in the library to 404 against
 * the bucket.
 */
@Injectable()
export class S3ReportCardStorageWriter implements ReportCardStorageWriter, OnModuleInit {
  private readonly logger = new Logger(S3ReportCardStorageWriter.name);
  private client: S3Client | null = null;
  private bucket: string | undefined;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const region = this.configService.get<string>('S3_REGION');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !this.bucket) {
      const nodeEnv = this.configService.get<string>('NODE_ENV');
      if (nodeEnv !== 'test') {
        throw new Error(
          'S3ReportCardStorageWriter: S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET_NAME must all be set. ' +
            'The worker cannot accept PDF jobs without a configured storage backend.',
        );
      }
      this.logger.warn(
        'S3 env vars are not fully configured — running in test mode, uploads will fail at runtime.',
      );
      return;
    }

    const config: S3ClientConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    };
    this.client = new S3Client(config);
  }

  private ensureClient(): S3Client {
    if (!this.client) {
      throw new Error(
        'S3ReportCardStorageWriter not configured — S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET_NAME are required.',
      );
    }
    return this.client;
  }

  /**
   * Uploads a rendered report-card PDF under `{tenantId}/{key}` and returns
   * the full object key (including the tenant prefix) so the caller can
   * store it verbatim in `report_cards.pdf_storage_key`.
   */
  async upload(tenantId: string, key: string, body: Buffer, contentType: string): Promise<string> {
    const client = this.ensureClient();
    const fullKey = `${tenantId}/${key}`;

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    return fullKey;
  }

  async delete(key: string): Promise<void> {
    const client = this.ensureClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
