const captureService = require('../services/capture.service');

exports.uploadCapture = async (req, res) => {
  try {
    const response = await captureService.uploadCapture(req);
    res.status(201).json({ success: true, data: response });
  } catch (error) {
    console.error('[CAPTURE] Upload error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCaptures = async (req, res) => {
  try {
    const captures = await captureService.getCaptures();
    res.status(200).json({ success: true, data: captures });
  } catch (error) {
    console.error('[CAPTURE] Get error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};