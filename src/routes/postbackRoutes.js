const express = require('express');
const router = express.Router();
const postbackController = require('../controllers/postbackController');

// Accepts GET /api/postbacks/:network and POST /api/postbacks/:network
router.all('/:network', postbackController.handlePostback);

// Generic fallback /api/postbacks
router.all('/', postbackController.handlePostback);

module.exports = router;
