const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

/**
 * GET /api/search?q=...&type=all|products|stores|categories|offers|coupons
 */
router.get('/', searchController.universalSearch);

/**
 * GET /api/search/comparison/:id
 */
router.get('/comparison/:id', searchController.getProductComparison);

module.exports = router;
