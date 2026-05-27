const IoRedis = require('ioredis');

// ioredis v5+ exports { default: Redis } under ESM interop
// This handles both: require('ioredis') = class directly, or { default: class }
const Redis = IoRedis.default || IoRedis;

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
});

redis.on('connect', () => {
  console.log('Redis Connected Successfully');
});

redis.on('error', (error) => {
  console.log('Redis Error:', error.message);
});

const addJob = async (captureId) => {

  await redis.lpush(
    'ocrQueue',
    JSON.stringify({
      captureId,
      createdAt: new Date()
    })
  );

  console.log('OCR Job Added');
};

const getJob = async () => {

  const job = await redis.rpop('ocrQueue');

  if (!job) {
    return null;
  }

  return JSON.parse(job);
};

const removeAllJobs = async () => {

  await redis.del('ocrQueue');

  console.log('All OCR Jobs Removed');
};

module.exports = {
  redis,
  addJob,
  getJob,
  removeAllJobs
};