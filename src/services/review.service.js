const prisma = require('../database/prismaClient');

const auditService = require('./audit.service');

exports.approveCapture = async (captureId, reviewerId) => {

  const capture = await prisma.capture.update({
    where: {
      id: captureId
    },
    data: {
      status: 'APPROVED'
    }
  });

  await auditService.createAuditLog({
    captureId,
    eventType: 'APPROVED',
    actorId: reviewerId,
    actorType: 'HUMAN'
  });

  return capture;
};

exports.rejectCapture = async (captureId, reviewerId) => {

  const capture = await prisma.capture.update({
    where: {
      id: captureId
    },
    data: {
      status: 'REJECTED'
    }
  });

  await auditService.createAuditLog({
    captureId,
    eventType: 'REJECTED',
    actorId: reviewerId,
    actorType: 'HUMAN'
  });

  return capture;
};

exports.updateField = async (fieldId, currentValue, reviewerId) => {

  const existingField = await prisma.extractedField.findUnique({
    where: {
      id: fieldId
    }
  });

  if (!existingField) {
    throw new Error('Field not found');
  }

  const updatedField = await prisma.extractedField.update({
    where: {
      id: fieldId
    },
    data: {
      value: currentValue
    }
  });

  await auditService.createAuditLog({
    captureId: existingField.captureId,
    eventType: 'FIELD_UPDATED',
    fieldName: existingField.fieldName,
    oldValue: existingField.value,
    newValue: currentValue,
    actorId: reviewerId,
    actorType: 'HUMAN'
  });

  return updatedField;
};

exports.getPendingReviews = async () => {

  return await prisma.capture.findMany({
    where: {
      status: 'PENDING_REVIEW'
    },
    orderBy: {
      uploadedAt: 'asc'
    }
  });
};

exports.getReviewById = async (captureId) => {

  const capture = await prisma.capture.findUnique({
    where: {
      id: captureId
    },
    include: {
      extractedFields: true
    }
  });

  if (!capture) {
    throw new Error('Capture not found');
  }

  return capture;
};