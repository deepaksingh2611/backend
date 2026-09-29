const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

/**
 * GET /api/categories/:categoryId
 */
router.get('/:categoryId', categoryController.getCategoryDetail);

/**
 * GET /api/categories/:categoryId/subcategories/:subcategoryId
 */
router.get('/:categoryId/subcategories/:subcategoryId', categoryController.getSubcategoryDetail);

module.exports = router;
