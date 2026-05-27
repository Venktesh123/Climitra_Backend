const express = require('express');
const multer = require('multer');

const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');

// MEMORY STORAGE - file.buffer will have the image data
const upload = multer({
  storage: multer.memoryStorage()
});

const {
  uploadCapture,
  getCaptures
} = require('../controllers/capture.controller');

router.post(
  '/upload',
  authMiddleware,
  upload.single('image'),
  uploadCapture
);

router.get(
  '/',
  authMiddleware,
  getCaptures
);

module.exports = router;