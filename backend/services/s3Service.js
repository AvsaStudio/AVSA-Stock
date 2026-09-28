const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
let client;
async function getLatestDailyReport() {
  if (!process.env.S3_ENDPOINT && !process.env.S3_BUCKET) return null;
  if (!client) client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } : undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT), maxAttempts: 2,
  });
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET || 'financial-dashboard', Key: 'daily-reports/latest.json' }), { abortSignal: AbortSignal.timeout(3000) });
    return JSON.parse(await result.Body.transformToString());
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw Object.assign(new Error('Daily report storage is unavailable'), { status: 503 });
  }
}
module.exports = { getLatestDailyReport };
