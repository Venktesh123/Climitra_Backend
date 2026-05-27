const { put } = require('@vercel/blob');

const prisma = require('../database/prismaClient');

const queueService = require('./queue.service');

exports.uploadCapture = async (req) => {
  const file = req.file;

  if (!file) {
    throw new Error('No image file provided');
  }

  const { documentType } = req.body;
  const uploadedById = req.user.id;

  const blob = await put(
    file.originalname,
    file.buffer,
    {
      access: 'public',
      contentType: file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }
  );

  const capture = await prisma.capture.create({
    data: {
      documentType,
      status: 'QUEUED',
      blobUrl: blob.url,
      uploadedById
    }
  });

  await queueService.addJob(capture.id);

  return capture;
};

exports.getCaptures = async () => {
  return await prisma.capture.findMany({
    orderBy: { uploadedAt: 'desc' }
  });
};