const queueService = require('../services/queue.service');
const ocrService = require('../modules/ocr/ocrPipeline');

const processJobs = async () => {
  const captureId = await queueService.getJob();

  if (!captureId) {
    console.log('No jobs found');
    return;
  }

  await ocrService.processOCR(captureId);
};

processJobs();