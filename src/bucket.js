import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Check if bucket is configured
export function isBucketConfigured() {
  return !!(process.env.BUCKET_NAME || process.env.AWS_BUCKET_NAME) && !!process.env.AWS_ACCESS_KEY_ID;
}

function getClient() {
  return new S3Client({
    region: process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || process.env.AWS_ENDPOINT_URL || undefined,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });
}

function getBucketName() {
  return process.env.BUCKET_NAME || process.env.AWS_BUCKET_NAME;
}

async function walkDir(dir) {
  let results = [];
  const list = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(await walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export async function syncToBucket(dataDir = 'data', logger = console) {
  if (!isBucketConfigured()) {
    logger.warn('[bucket] Skipping sync: S3 bucket not configured (missing BUCKET_NAME or AWS credentials).');
    return false;
  }
  
  const client = getClient();
  const bucket = getBucketName();
  
  logger.info(`[bucket] Syncing local data directory to bucket: ${bucket}...`);
  try {
    const files = await walkDir(dataDir);
    let uploaded = 0;
    
    for (const filePath of files) {
      // Create S3 key (e.g., 'data/history.json' or 'media/smart.boy9813/avatar.png')
      // We will store everything under a prefix or just at the root. Let's just mirror the local structure relative to the project root.
      // So 'data/config.json' becomes 'data/config.json' in the bucket.
      const s3Key = filePath; // Since dataDir is 'data', filePath is like 'data/config.json'
      
      const fileStream = fs.createReadStream(filePath);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileStream,
      }));
      uploaded++;
    }
    logger.info(`[bucket] Successfully uploaded ${uploaded} files to bucket.`);
    return true;
  } catch (err) {
    logger.error(`[bucket] Failed to sync to bucket: ${err.message}`);
    return false;
  }
}

export async function restoreFromBucket(dataDir = 'data', logger = console) {
  if (!isBucketConfigured()) {
    logger.warn('[bucket] Skipping restore: S3 bucket not configured.');
    return false;
  }
  
  const client = getClient();
  const bucket = getBucketName();
  
  logger.info(`[bucket] Checking for existing data in bucket: ${bucket}...`);
  try {
    const listRes = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: dataDir + '/'
    }));
    
    if (!listRes.Contents || listRes.Contents.length === 0) {
      logger.info('[bucket] No existing data found in bucket.');
      return false;
    }
    
    logger.info(`[bucket] Found ${listRes.Contents.length} files. Downloading...`);
    
    // Ensure base directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    for (const obj of listRes.Contents) {
      const key = obj.Key;
      // Skip directory objects
      if (key.endsWith('/')) continue;
      
      const res = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));
      
      // Ensure local directories exist
      const localPath = key; // key is like 'data/media/user/file.jpg'
      const dirName = path.dirname(localPath);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }
      
      // Stream to file
      const destStream = fs.createWriteStream(localPath);
      await new Promise((resolve, reject) => {
        res.Body.pipe(destStream)
          .on('error', reject)
          .on('close', resolve);
      });
    }
    
    logger.info('[bucket] Successfully restored data from bucket.');
    return true;
  } catch (err) {
    logger.error(`[bucket] Failed to restore from bucket: ${err.message}`);
    return false;
  }
}
