import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { HttpError } from './http';

let client: S3Client | null = null;

/** DigitalOcean Spaces is S3-compatible, so the AWS SDK talks to it directly. */
function spaces() {
  if (!env.SPACES_ENDPOINT || !env.SPACES_BUCKET || !env.SPACES_KEY || !env.SPACES_SECRET) {
    throw new HttpError(503, 'File storage is not set up yet. Add the SPACES_* settings on the server');
  }
  client ??= new S3Client({
    endpoint: env.SPACES_ENDPOINT,
    region: env.SPACES_REGION,
    credentials: { accessKeyId: env.SPACES_KEY, secretAccessKey: env.SPACES_SECRET },
  });
  return { client, bucket: env.SPACES_BUCKET };
}

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-120);

export async function presignUpload(productionId: string, fileName: string, mimeType: string) {
  const { client, bucket } = spaces();
  const key = `productions/${productionId}/${randomUUID()}-${safeName(fileName)}`;
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }), { expiresIn: 600 });
  return { key, uploadUrl };
}

export async function presignDownload(key: string, fileName: string) {
  const { client, bucket } = spaces();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename="${safeName(fileName)}"` }), { expiresIn: 300 });
}

export async function removeObject(key: string) {
  const { client, bucket } = spaces();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  const { client, bucket } = spaces();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ACL: 'public-read' }));
  return `${env.SPACES_ENDPOINT!.replace('://', `://${bucket}.`)}/${key}`;
}
