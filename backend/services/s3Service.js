/**
 * S3 / MinIO Service
 * Raw data archival and daily report storage
 */

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: !!process.env.S3_ENDPOINT, // required for MinIO
  });

  return s3Client;
}

const BUCKET = process.env.S3_BUCKET || 'financial-dashboard';

async function uploadRawData(data, path) {
  try {
    const client = getS3Client();
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: path,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }));
    console.log(`[S3] Uploaded: ${path}`);
  } catch (err) {
    console.warn('[S3] Upload error:', err.message);
  }
}

async function uploadDailyReport(report, date) {
  const path = `daily-reports/${date}/report.json`;
  return uploadRawData(report, path);
}

async function uploadRawStockSnapshot(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const date = new Date().toISOString().slice(0, 10);
  const path = `raw-data/${date}/stocks-${ts}.json`;
  return uploadRawData(data, path);
}

async function listFiles(prefix) {
  try {
    const client = getS3Client();
    const result = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    }));
    return (result.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }));
  } catch (err) {
    console.warn('[S3] List error:', err.message);
    return [];
  }
}

module.exports = {
  uploadRawData,
  uploadDailyReport,
  uploadRawStockSnapshot,
  listFiles,
};
