const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliateController');

// POST /api/affiliate/generate-link
router.post('/generate-link', affiliateController.generateLink);

// GET /api/affiliate/clicks/:userId
router.get('/clicks/:userId', affiliateController.getUserClicks);

module.exports = router;
