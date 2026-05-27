const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');

const {
  register,
  login,
  logout
} = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);

// Logout requires a valid token (authMiddleware runs first)
router.post('/logout', authMiddleware, logout);

module.exports = router;