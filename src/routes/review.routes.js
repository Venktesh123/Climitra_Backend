const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');

const {
  approveCapture,
  rejectCapture,
  updateField,
  getPendingReviews,
  getReviewById
} = require('../controllers/review.controller');

router.get('/pending', authMiddleware, getPendingReviews);

router.get('/:captureId', authMiddleware, getReviewById);

router.post('/approve/:captureId', authMiddleware, approveCapture);

router.post('/reject/:captureId', authMiddleware, rejectCapture);

router.put('/field/:fieldId', authMiddleware, updateField);

module.exports = router;