import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const region = process.env.S3_REGION || 'auto'
const bucket = process.env.S3_BUCKET || ''
const endpoint = process.env.S3_ENDPOINT || undefined

let client: S3Client | null = null

export function isS3Configured(): boolean {
  return bucket !== '' && !!process.env.S3_ACCESS_KEY_ID && !!process.env.S3_SECRET_ACCESS_KEY
}

function getS3(): S3Client {
  if (!client) {
    if (!isS3Configured()) {
      throw new Error('S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY belum diset')
    }
    client = new S3Client({
      region,
      endpoint,
      forcePathStyle: !!endpoint, // R2/MinIO pakai path-style
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
      }
    })
  }
  return client
}

// URL PUT berbatas waktu untuk upload dari booth
export async function presignPut(key: string, contentType: string, expiresSec = 900): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
  return getSignedUrl(getS3(), cmd, { expiresIn: expiresSec })
}

// URL GET berbatas waktu untuk download publik (halaman download & frame assets)
export async function presignGet(key: string, expiresSec = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(getS3(), cmd, { expiresIn: expiresSec })
}
