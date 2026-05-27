const express = require('express');

const authRoutes = require('./auth.routes');
const captureRoutes = require('./capture.routes');
const reviewRoutes = require('./review.routes');
const auditRoutes = require('./audit.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/captures', captureRoutes);
router.use('/review', reviewRoutes);
router.use('/audit', auditRoutes);

module.exports = router;