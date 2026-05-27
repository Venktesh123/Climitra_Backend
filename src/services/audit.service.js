const prisma = require('../database/prismaClient');

exports.getAuditLogs = async (captureId) => {

  const logs = await prisma.auditEvent.findMany({
    where: {
      captureId
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return logs;
};

exports.createAuditLog = async ({
  captureId,
  eventType,
  fieldName = null,
  oldValue = null,
  newValue = null,
  actorId,
  actorType
}) => {

  const auditLog = await prisma.auditEvent.create({
    data: {
      captureId,
      eventType,
      fieldName,
      oldValue,
      newValue,
      actorId,
      actorType
    }
  });

  return auditLog;
};