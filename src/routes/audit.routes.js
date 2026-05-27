const express = require('express');

const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');

const {
  getAuditLogs
} = require('../controllers/audit.controller');

router.get(
  '/:captureId',
  authMiddleware,
  getAuditLogs
);

module.exports = router;