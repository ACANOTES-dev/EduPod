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
   *
   * `downloadFilename` sets the `ResponseContentDisposition` override on the
   * signed URL so S3 returns `Content-Disposition: attachment; filename="…"`
   * and the browser saves the file under that name instead of the random
   * storage key. The name is sanitised to ASCII — any non-`[A-Za-z0-9 _.-]`
   * character is replaced with `-` — so naive browsers and older unzip
   * tools don't trip on exotic characters. If the caller wants to inline
   * the file (e.g. PDF preview in a new tab), set `inline: true`.
   */
  async getPresignedUrl(
    key: string,
    expiresIn = 3600,
    options: { downloadFilename?: string; inline?: boolean } = {},
  ): Promise<string> {
    const client = this.ensureClient();
    const commandInput: ConstructorParameters<typeof GetObjectCommand>[0] = {
      Bucket: this.bucket,
      Key: key,
    };
    if (options.downloadFilename) {
      // Keep `()` and ASCII punctuation that Finder/Explorer handle fine;
      // strip anything exotic (em dash, fancy quotes, diacritics) so the
      // HTTP Content-Disposition header stays strictly ASCII.
      const safe = options.downloadFilename.replace(/[^A-Za-z0-9 _.()-]+/g, '-').trim();
      const disposition = options.inline ? 'inline' : 'attachment';
      commandInput.ResponseContentDisposition = `${disposition}; filename="${safe}"`;
    }
    return getSignedUrl(client, new GetObjectCommand(commandInput), { expiresIn });
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
