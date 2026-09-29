const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

/**
 * GET /api/products/:productId/compare
 */
router.get('/:productId/compare', categoryController.compareProduct);

module.exports = router;
