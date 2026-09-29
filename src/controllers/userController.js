const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');

// ─── Multer Setup for Avatar Uploads ────────────────────────────────────────
const avatarUploadDir = path.join(__dirname, '../../public/uploads/avatars');
if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
    }
  },
}).single('avatar');
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/users/:id
 * Fetches user profile details by unique user ID
 */
async function getUserById(req, res) {
  try {
    const { id } = req.params;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'User ID parameter is required.',
      });
    }

    const result = await db.query(
      `SELECT
        id, name, email, phone_number, referral_code, referred_by,
        coins, wallet_balance, COALESCE(remaining_balance, wallet_balance, 0.00) as remaining_balance,
        has_shopped, confirmed_cashback,
        pending_cashback, referral_earnings,
        COALESCE(affiliate_earnings, 0.00) as affiliate_earnings,
        avatar_url,
        created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found with the provided ID.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phone_number,
        avatarUrl: user.avatar_url,
        referralCode: user.referral_code,
        referredBy: user.referred_by,
        walletBalance: parseFloat(user.wallet_balance || 0),
        remainingBalance: parseFloat(user.remaining_balance != null ? user.remaining_balance : user.wallet_balance || 0),
        hasShopped: user.has_shopped || false,
        confirmedCashback: parseFloat(user.confirmed_cashback || 0),
        pendingCashback: parseFloat(user.pending_cashback || 0),
        referralEarnings: parseFloat(user.referral_earnings || 0),
        affiliateEarnings: parseFloat(user.affiliate_earnings || 0),
        coins: user.coins || 0,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('Error in getUserById:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching user profile.',
      error: error.message,
    });
  }
}

/**
 * Computes dynamic spending analytics (Daily last 7 days, Monthly last 7 months, and totals)
 * directly aggregated from the database (cashback_orders table).
 */
async function getSpendingAnalyticsData(userId) {
  // 1. Daily: Last 7 calendar days up to today
  const dailyRes = await db.query(
    `WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day_date
    )
    SELECT
      d.day_date,
      TO_CHAR(d.day_date, 'Dy') AS label,
      TO_CHAR(d.day_date, 'FMDay, FMDD Mon') AS full_date,
      (d.day_date = CURRENT_DATE) AS is_today,
      COALESCE(SUM(o.order_amount), 0)::numeric(10,2) AS amount,
      COALESCE(SUM(o.cashback_amount), 0)::numeric(10,2) AS cashback,
      COUNT(o.id)::int AS order_count
    FROM days d
    LEFT JOIN cashback_orders o
      ON o.user_id = $1
      AND o.created_at::date = d.day_date
      AND o.status != 'CANCELLED'
    GROUP BY d.day_date
    ORDER BY d.day_date ASC;`,
    [userId]
  );

  const daily = dailyRes.rows.map((row) => ({
    label: row.label,
    fullDate: row.is_today ? `${row.full_date} (Today)` : row.full_date,
    amount: parseFloat(row.amount || 0),
    cashback: parseFloat(row.cashback || 0),
    orderCount: parseInt(row.order_count || 0, 10),
  }));

  // 2. Monthly: Last 7 calendar months up to current month
  const monthlyRes = await db.query(
    `WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      )::date AS month_date
    )
    SELECT
      m.month_date,
      TO_CHAR(m.month_date, 'Mon') AS label,
      TO_CHAR(m.month_date, 'FMMonth YYYY') AS full_date,
      (m.month_date = DATE_TRUNC('month', CURRENT_DATE)::date) AS is_current_month,
      COALESCE(SUM(o.order_amount), 0)::numeric(10,2) AS amount,
      COALESCE(SUM(o.cashback_amount), 0)::numeric(10,2) AS cashback,
      COUNT(o.id)::int AS order_count
    FROM months m
    LEFT JOIN cashback_orders o
      ON o.user_id = $1
      AND DATE_TRUNC('month', o.created_at)::date = m.month_date
      AND o.status != 'CANCELLED'
    GROUP BY m.month_date
    ORDER BY m.month_date ASC;`,
    [userId]
  );

  const monthly = monthlyRes.rows.map((row) => ({
    label: row.label,
    fullDate: row.is_current_month ? `${row.full_date} (MTD)` : row.full_date,
    amount: parseFloat(row.amount || 0),
    cashback: parseFloat(row.cashback || 0),
    orderCount: parseInt(row.order_count || 0, 10),
  }));

  // 3. Overall Totals
  const totalsRes = await db.query(
    `SELECT
      COALESCE(SUM(order_amount), 0)::numeric(10,2) AS total_spend,
      COALESCE(SUM(cashback_amount), 0)::numeric(10,2) AS total_cashback,
      COUNT(id)::int AS total_orders
    FROM cashback_orders
    WHERE user_id = $1 AND status != 'CANCELLED';`,
    [userId]
  );

  const totals = totalsRes.rows[0] || {};

  return {
    daily,
    monthly,
    totalSpend: parseFloat(totals.total_spend || 0),
    totalCashback: parseFloat(totals.total_cashback || 0),
    totalOrders: parseInt(totals.total_orders || 0, 10),
  };
}

/**
 * GET /api/users/:id/wallet
 * Returns live wallet details: balance, shopping status, cashback breakdown, real transactions & database spending analytics
 */
async function getUserWallet(req, res) {
  try {
    const { id } = req.params;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'User ID parameter is required.',
      });
    }

    const userRes = await db.query(
      `SELECT
        id, name, wallet_balance, COALESCE(remaining_balance, wallet_balance, 0.00) as remaining_balance,
        has_shopped, confirmed_cashback,
        pending_cashback, referral_earnings,
        COALESCE(affiliate_earnings, 0.00) as affiliate_earnings
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id.trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = userRes.rows[0];

    // Fetch real transactions from wallet_transactions (fallback to coin_transactions)
    let txRes = await db.query(
      `SELECT id, amount, type, status, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id.trim()]
    );

    let transactions = txRes.rows.map((tx) => ({
      id: tx.id,
      amount: parseFloat(tx.amount || 0),
      type: tx.type, // 'CASHBACK_CONFIRMED', 'CASHBACK_PENDING', 'AFFILIATE', 'REFERRAL', 'SIGNUP_BONUS', 'WITHDRAWAL'
      status: tx.status || 'CONFIRMED',
      description: tx.description,
      createdAt: tx.created_at,
    }));

    // Fetch dynamic spending analytics computed purely from database
    const spendingAnalytics = await getSpendingAnalyticsData(id.trim());

    return res.status(200).json({
      success: true,
      wallet: {
        userId: user.id,
        balance: parseFloat(user.wallet_balance || 0),
        remainingBalance: parseFloat(user.remaining_balance != null ? user.remaining_balance : user.wallet_balance || 0),
        hasShopped: user.has_shopped || false,
        confirmedCashback: parseFloat(user.confirmed_cashback || 0),
        pendingCashback: parseFloat(user.pending_cashback || 0),
        referralEarnings: parseFloat(user.referral_earnings || 0),
        affiliateEarnings: parseFloat(user.affiliate_earnings || 0),
        transactions,
        spendingAnalytics,
      },
    });
  } catch (error) {
    console.error('Error in getUserWallet:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching wallet data.',
      error: error.message,
    });
  }
}

/**
 * GET /api/users/:id/spending-analytics
 * Dedicated endpoint to fetch spending & cashback graph analytics from DB
 */
async function getSpendingAnalytics(req, res) {
  try {
    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'User ID parameter is required.',
      });
    }

    const analytics = await getSpendingAnalyticsData(id.trim());
    return res.status(200).json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Error in getSpendingAnalytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch spending analytics.',
      error: error.message,
    });
  }
}

/**
 * GET /api/users/:id/referrals
 * Returns user's referral summary & list of referred users in Rupees
 */
async function getUserReferrals(req, res) {
  try {
    const { id } = req.params;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'User ID parameter is required.',
      });
    }

    // 1. Fetch user referral code and referral earnings
    const userRes = await db.query(
      'SELECT id, name, referral_code, wallet_balance, referral_earnings, coins FROM users WHERE id = $1 LIMIT 1',
      [id.trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = userRes.rows[0];

    // 2. Fetch referred friends with shopping status
    const refRes = await db.query(
      `SELECT id, name, phone_number, has_shopped, created_at
       FROM users
       WHERE referred_by = $1
       ORDER BY created_at DESC`,
      [id.trim()]
    );

    // 3. Fetch transaction log from wallet_transactions (or coin_transactions)
    let txRes = await db.query(
      `SELECT id, amount, type, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [id.trim()]
    );

    if (txRes.rows.length === 0) {
      txRes = await db.query(
        `SELECT id, amount, type, description, created_at
         FROM coin_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [id.trim()]
      );
    }

    const referralCash = parseFloat(user.referral_earnings || 0);
    const totalReferred = refRes.rows.length;
    const purchasedUsersCount = refRes.rows.filter((r) => r.has_shopped === true).length;
    const pendingPurchaseCount = totalReferred - purchasedUsersCount;

    return res.status(200).json({
      success: true,
      referralCode: user.referral_code,
      referralEarnings: referralCash,
      totalCoins: Math.round(referralCash), // Backwards compatibility
      referrerReward: 20.00, // ₹20 earned per invite
      refereeReward: 10.00,  // ₹10 earned by invited friend
      totalReferred,
      purchasedUsersCount,
      pendingPurchaseCount,
      referredUsers: refRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        phoneNumber: r.phone_number
          ? r.phone_number.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')
          : '',
        hasShopped: r.has_shopped || false,
        createdAt: r.created_at,
      })),
      transactions: txRes.rows.map((tx) => ({
        id: tx.id,
        amount: parseFloat(tx.amount || 0),
        type: tx.type,
        description: tx.description,
        createdAt: tx.created_at,
      })),
    });
  } catch (error) {
    console.error('Error in getUserReferrals:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching user referrals.',
      error: error.message,
    });
  }
}

/**
 * PUT /api/users/:id
 * Updates user profile details in PostgreSQL
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, avatarUrl } = req.body;

    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'User ID parameter is required.',
      });
    }

    const cleanName = name ? name.trim() : null;
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanPhone = phoneNumber ? phoneNumber.trim() : null;
    const cleanAvatar = avatarUrl !== undefined ? (avatarUrl ? avatarUrl.trim() : null) : undefined;

    const result = await db.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone_number = COALESCE($3, phone_number),
           avatar_url = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE avatar_url END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING
        id, name, email, phone_number, referral_code, referred_by,
        coins, wallet_balance, has_shopped, confirmed_cashback,
        pending_cashback, referral_earnings, avatar_url, created_at, updated_at`,
      [cleanName, cleanEmail, cleanPhone, cleanAvatar !== undefined ? cleanAvatar : null, id.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found with the provided ID.',
      });
    }

    const updatedUser = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phone_number,
        avatarUrl: updatedUser.avatar_url,
        referralCode: updatedUser.referral_code,
        referredBy: updatedUser.referred_by,
        walletBalance: parseFloat(updatedUser.wallet_balance || 0),
        hasShopped: updatedUser.has_shopped || false,
        confirmedCashback: parseFloat(updatedUser.confirmed_cashback || 0),
        pendingCashback: parseFloat(updatedUser.pending_cashback || 0),
        referralEarnings: parseFloat(updatedUser.referral_earnings || 0),
        coins: updatedUser.coins || 0,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
      },
    });
  } catch (error) {
    console.error('Error in updateUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while updating user profile.',
      error: error.message,
    });
  }
}

/**
 * POST /api/users/:id/first-order
 * Completes a user's first shopping order.
 * - Marks has_shopped = true
 * - If User B was referred by User A:
 *   - User A (Referrer) gets ₹20.00
 *   - User B (Referee) gets ₹10.00
 *   - Both receive a transaction record in wallet_transactions
 */
async function completeFirstShoppingOrder(req, res) {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    await client.query('BEGIN');

    const userRes = await client.query(
      `SELECT id, name, referral_code, referred_by, has_shopped, wallet_balance, referral_earnings
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [id.trim()]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const userB = userRes.rows[0];

    if (userB.has_shopped) {
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        message: 'User has already completed first shopping order.',
        alreadyCompleted: true,
      });
    }

    // Mark has_shopped = true
    await client.query(
      `UPDATE users
       SET has_shopped = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [userB.id]
    );

    let referrerBonusAwarded = false;
    let refereeBonusAwarded = false;

    if (userB.referred_by && userB.referred_by.trim()) {
      // Find Referrer User A by id or referral_code
      const refCheck = await client.query(
        `SELECT id, name, referral_code, wallet_balance, referral_earnings
         FROM users
         WHERE id = $1 OR UPPER(referral_code) = UPPER($1)
         LIMIT 1`,
        [userB.referred_by.trim()]
      );

      if (refCheck.rows.length > 0) {
        const userA = refCheck.rows[0];
        const REFERRER_BONUS = 20.00;
        const REFEREE_BONUS = 10.00;

        // 1. Credit User A (Referrer) ₹20
        await client.query(
          `UPDATE users
           SET wallet_balance = wallet_balance + $1,
               remaining_balance = COALESCE(remaining_balance, wallet_balance) + $1,
               referral_earnings = referral_earnings + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [REFERRER_BONUS, userA.id]
        );

        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
           VALUES ($1, $2, $3, 'REFERRAL', 'CONFIRMED', $4)`,
          [
            `wtx_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
            userA.id,
            REFERRER_BONUS,
            `Referral Bonus: Friend (${userB.name || 'Friend'}) completed 1st shopping order (+₹20)`,
          ]
        );
        referrerBonusAwarded = true;

        // 2. Credit User B (Referee) ₹10
        await client.query(
          `UPDATE users
           SET wallet_balance = wallet_balance + $1,
               remaining_balance = COALESCE(remaining_balance, wallet_balance) + $1,
               referral_earnings = referral_earnings + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [REFEREE_BONUS, userB.id]
        );

        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
           VALUES ($1, $2, $3, 'REFERRAL', 'CONFIRMED', $4)`,
          [
            `wtx_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
            userB.id,
            REFEREE_BONUS,
            `Welcome Referral Bonus: Completed 1st shopping order (+₹10)`,
          ]
        );
        refereeBonusAwarded = true;
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'First shopping order processed! Referral bonuses credited.',
      hasShopped: true,
      referrerBonusAwarded,
      refereeBonusAwarded,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in completeFirstShoppingOrder:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while completing first shopping order.',
      error: error.message,
    });
  } finally {
    client.release();
  }
}

/**
 * GET /api/users/:id/orders
 * Returns user's tracked cashback shopping orders
 */
async function getUserOrders(req, res) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const result = await db.query(
      `SELECT id, click_id, store_name, order_amount, commission_amount,
              cashback_amount, status, network, created_at, updated_at
       FROM cashback_orders
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [id.trim()]
    );

    return res.status(200).json({
      success: true,
      orders: result.rows,
    });
  } catch (error) {
    console.error('Error in getUserOrders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user orders.',
      error: error.message,
    });
  }
}

/**
 * POST /api/users/:id/withdraw
 * Processes a cash withdrawal request from user's confirmed wallet balance
 */
async function withdrawWalletBalance(req, res) {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const { amount, method = 'UPI', paymentDetails = '' } = req.body;

    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount < 250) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹250.',
      });
    }

    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT id, wallet_balance, confirmed_cashback FROM users WHERE id = $1 FOR UPDATE',
      [id.trim()]
    );

    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentBalance = parseFloat(userRes.rows[0].wallet_balance || 0);
    if (withdrawAmount > currentBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Requested amount ₹${withdrawAmount.toFixed(2)} exceeds available balance of ₹${currentBalance.toFixed(2)}.`,
      });
    }

    const newBalance = currentBalance - withdrawAmount;
    await client.query(
      `UPDATE users
       SET wallet_balance = $1,
           remaining_balance = $1,
           coins = GREATEST(0, coins - $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newBalance, Math.round(withdrawAmount), id.trim()]
    );

    const txId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const desc = `Withdrawal request of ₹${withdrawAmount.toFixed(2)} via ${method} (${paymentDetails || 'Payment Gateway'})`;

    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
       VALUES ($1, $2, $3, 'WITHDRAWAL', 'PENDING', $4)`,
      [txId, id.trim(), -withdrawAmount, desc]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully.',
      transactionId: txId,
      remainingBalance: newBalance,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in withdrawWalletBalance:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing withdrawal.',
      error: error.message,
    });
  } finally {
    client.release();
  }
}

/**
 * POST /api/users/:id/upload-avatar
 * Accepts multipart/form-data with field "avatar" (image file).
 * Saves the file to public/uploads/avatars/ and updates avatar_url in DB.
 * Returns the public URL of the uploaded avatar.
 */
function uploadAvatar(req, res) {
  avatarUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file received. Please attach a file with field name "avatar".',
      });
    }

    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    try {
      // Build public URL (served via express.static from /public)
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host');
      const publicUrl = `${protocol}://${host}/uploads/avatars/${req.file.filename}`;

      // Persist to DB
      const result = await db.query(
        `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, name, email, phone_number, avatar_url`,
        [publicUrl, id.trim()]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const u = result.rows[0];
      return res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully.',
        avatarUrl: publicUrl,
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          phoneNumber: u.phone_number,
          avatarUrl: u.avatar_url,
        },
      });
    } catch (dbError) {
      console.error('Error saving avatar to DB:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Internal server error while saving avatar.',
        error: dbError.message,
      });
    }
  });
}

module.exports = {
  getUserById,
  getUserWallet,
  getSpendingAnalytics,
  getUserReferrals,
  getUserOrders,
  withdrawWalletBalance,
  updateUser,
  completeFirstShoppingOrder,
  uploadAvatar,
};
