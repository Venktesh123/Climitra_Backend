const auditService = require('../services/audit.service');

exports.getAuditLogs = async (req, res) => {
  try {

    const { captureId } = req.params;

    const logs = await auditService.getAuditLogs(
      captureId
    );

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};