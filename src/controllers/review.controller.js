const reviewService = require('../services/review.service');

exports.approveCapture = async (req, res) => {
  try {
    const { captureId } = req.params;
    const reviewerId = req.user.id;

    const response = await reviewService.approveCapture(
      captureId,
      reviewerId
    );

    return res.status(200).json({
      success: true,
      message: 'Capture approved successfully',
      data: response
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.rejectCapture = async (req, res) => {
  try {
    const { captureId } = req.params;
    const reviewerId = req.user.id;

    const response = await reviewService.rejectCapture(
      captureId,
      reviewerId
    );

    return res.status(200).json({
      success: true,
      message: 'Capture rejected successfully',
      data: response
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateField = async (req, res) => {
  try {
    const { fieldId } = req.params;

    const {
      currentValue
    } = req.body;

    const reviewerId = req.user.id;

    const response = await reviewService.updateField(
      fieldId,
      currentValue,
      reviewerId
    );

    return res.status(200).json({
      success: true,
      message: 'Field updated successfully',
      data: response
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getPendingReviews = async (req, res) => {
  try {

    const captures = await reviewService.getPendingReviews();

    return res.status(200).json({
      success: true,
      count: captures.length,
      data: captures
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getReviewById = async (req, res) => {
  try {

    const { captureId } = req.params;

    const capture = await reviewService.getReviewById(
      captureId
    );

    return res.status(200).json({
      success: true,
      data: capture
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};