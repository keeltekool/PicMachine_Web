import { S3Client, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

/** List all image objects for a user (prefix = userId/) */
export async function listUserImages(userId: string) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: `${userId}/`,
  });

  const response = await r2.send(command);
  return (response.Contents ?? []).filter((obj) => obj.Key && obj.Size && obj.Size > 0);
}

/** Generate a presigned GET URL (for viewing an image) */
export async function getViewUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

/** Generate a presigned PUT URL (for browser-direct upload) */
export async function getUploadUrl(key: string, contentType: string, expiresIn = 600) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

/** Delete a single object */
export async function deleteImage(key: string) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  return r2.send(command);
}

/** Batch delete multiple objects */
export async function deleteImages(keys: string[]) {
  const command = new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
    },
  });
  return r2.send(command);
}
