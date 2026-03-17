import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Create an S3-compatible client using env vars.
 * Works with Hetzner Object Storage, AWS S3, MinIO, etc.
 */
export function createS3Client(): S3Client {
  const endpoint = process.env['S3_ENDPOINT'];
  return new S3Client({
    region: process.env['S3_REGION'] || 'us-east-1',
    ...(process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_ACCESS_KEY']
      ? {
          credentials: {
            accessKeyId: process.env['S3_ACCESS_KEY_ID'],
            secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'],
          },
        }
      : {}),
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

export function getS3Bucket(): string {
  return process.env['S3_BUCKET_NAME'] || 'edupod-assets';
}

export async function downloadFromS3(fileKey: string): Promise<string> {
  const s3 = createS3Client();
  const response = await s3.send(
    new GetObjectCommand({ Bucket: getS3Bucket(), Key: fileKey }),
  );
  if (!response.Body) throw new Error(`Empty response body from S3 for key ${fileKey}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function uploadToS3(fileKey: string, content: string, contentType = 'application/json'): Promise<void> {
  const s3 = createS3Client();
  await s3.send(
    new PutObjectCommand({ Bucket: getS3Bucket(), Key: fileKey, Body: content, ContentType: contentType }),
  );
}

export async function deleteFromS3(fileKey: string): Promise<void> {
  const s3 = createS3Client();
  await s3.send(
    new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: fileKey }),
  );
}
