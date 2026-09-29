const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');

/**
 * GET /api/home
 * Returns complete structured home discovery feed
 */
router.get('/', homeController.getHomeData);

module.exports = router;
