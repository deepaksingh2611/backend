const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/check-phone
router.post('/check-phone', authController.checkPhone);

// POST /api/auth/send-otp
router.post('/send-otp', authController.sendOtp);

// POST /api/auth/verify-otp
router.post('/verify-otp', authController.verifyOtp);

// POST /api/auth/signup
router.post('/signup', authController.signup);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/google
router.post('/google', authController.googleAuth);

module.exports = router;
