const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// POST /api/users/:id/upload-avatar  (multipart/form-data, field: "avatar")
router.post('/:id/upload-avatar', userController.uploadAvatar);

// GET /api/users/:id/wallet
router.get('/:id/wallet', userController.getUserWallet);

// GET /api/users/:id/spending-analytics
router.get('/:id/spending-analytics', userController.getSpendingAnalytics);

// GET /api/users/:id/referrals
router.get('/:id/referrals', userController.getUserReferrals);

// GET /api/users/:id/orders
router.get('/:id/orders', userController.getUserOrders);

// GET /api/users/:id
router.get('/:id', userController.getUserById);

// PUT /api/users/:id
router.put('/:id', userController.updateUser);

// POST /api/users/:id/first-order
router.post('/:id/first-order', userController.completeFirstShoppingOrder);

// POST /api/users/:id/withdraw
router.post('/:id/withdraw', userController.withdrawWalletBalance);

module.exports = router;
