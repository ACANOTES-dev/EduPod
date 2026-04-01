import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service implements OnModuleInit {
  private client: S3Client | null = null;
  private bucket: string | undefined;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const region = this.configService.get<string>('S3_REGION');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_ACCESS_KEY');
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME');

    if (region && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      });
    }
  }

  private ensureClient(): S3Client {
    if (!this.client) {
      throw new Error(
        'S3 client not configured. Set S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.',
      );
    }
    return this.client;
  }

  /**
   * Upload a file to S3 under the tenant namespace (`{tenantId}/{key}`).
   * Returns the full S3 key (with tenant prefix), not the bare `key` argument.
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

  /**
   * Download a file from S3.
   */
  async download(key: string): Promise<Buffer> {
    const client = this.ensureClient();
    const result = await client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const stream = result.Body;
    if (!stream) throw new Error('Empty response body');

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Generate a presigned URL for client-side upload or download.
   */
  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const client = this.ensureClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
  }

  /**
   * Delete a file from S3.
   */
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
