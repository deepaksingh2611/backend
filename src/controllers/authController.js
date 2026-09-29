const crypto = require('crypto');
const db = require('../config/db');
const otpService = require('../services/otpService');

/**
 * Simple token: base64url of userId + timestamp + random bytes.
 * Replace with JWT in production when a jwt library is added.
 */
function generateToken(userId) {
  const payload = `${userId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
  return Buffer.from(payload).toString('base64url');
}

// Referral Cash Reward Configuration in Rupees (₹)
const REFERRER_BONUS = 20.00; // ₹20 cash given to user whose code was shared
const REFEREE_BONUS = 10.00;  // ₹10 welcome cash given to new user who used code

function generateReferralCode(name) {
  const prefix = (name || 'KASH')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 4) || 'KASH';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${randomNum}`;
}

function formatUser(user) {
  return {
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
  };
}

function getPhoneVariants(raw) {
  if (!raw) return [];
  const clean = raw.trim();
  const digits = clean.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const variants = [clean];
  if (last10) {
    variants.push(last10);
    variants.push(`+91${last10}`);
    variants.push(`91${last10}`);
  }
  return [...new Set(variants.filter(Boolean))];
}

/**
 * POST /api/auth/check-phone
 * Body: { phoneNumber?: string, email?: string, identifier?: string }
 * Checks whether the phone number or email exists in PostgreSQL
 */
async function checkPhone(req, res) {
  try {
    const rawIdentifier = (req.body.phoneNumber || req.body.email || req.body.identifier || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required.',
      });
    }

    const isEmail = rawIdentifier.includes('@');
    const identifier = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    let result;
    if (isEmail) {
      result = await db.query(
        'SELECT id, name, email, phone_number FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [identifier]
      );
    } else {
      const variants = getPhoneVariants(identifier);
      const clauses = variants.map((_, i) => `phone_number = $${i + 1}`).join(' OR ');
      result = await db.query(
        `SELECT id, name, email, phone_number FROM users WHERE ${clauses} LIMIT 1`,
        variants
      );
    }

    const isRegistered = result.rows.length > 0;

    return res.status(200).json({
      success: true,
      isRegistered,
      message: isRegistered
        ? 'User exists. Proceed to OTP login.'
        : 'User not registered. Please provide details to sign up.',
      user: isRegistered
        ? {
          id: result.rows[0].id,
          name: result.rows[0].name,
          email: result.rows[0].email,
          phoneNumber: result.rows[0].phone_number,
        }
        : null,
    });
  } catch (error) {
    console.error('Error in checkPhone:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while checking account.',
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/send-otp
 * Body: { phoneNumber?: string, email?: string, identifier?: string }
 */
async function sendOtp(req, res) {
  try {
    const rawIdentifier = (req.body.phoneNumber || req.body.email || req.body.identifier || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required.',
      });
    }

    const isEmail = rawIdentifier.includes('@');
    const identifier = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    // Check if registered in PostgreSQL
    let userCheck;
    if (isEmail) {
      userCheck = await db.query(
        'SELECT id, name, email FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [identifier]
      );
    } else {
      const variants = getPhoneVariants(identifier);
      const clauses = variants.map((_, i) => `phone_number = $${i + 1}`).join(' OR ');
      userCheck = await db.query(
        `SELECT id, name, email FROM users WHERE ${clauses} LIMIT 1`,
        variants
      );
    }
    const isRegistered = userCheck.rows.length > 0;

    const result = otpService.generateOtp(identifier);

    return res.status(200).json({
      success: true,
      isRegistered,
      message: `OTP sent successfully to ${identifier}.`,
      otp: result.otp, // Returned in development for testing
      expiresIn: result.expiresInSeconds,
      isDummy: true,
    });
  } catch (error) {
    console.error('Error in sendOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while sending OTP.',
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { phoneNumber?: string, email?: string, identifier?: string, otp: string }
 */
async function verifyOtp(req, res) {
  try {
    const rawIdentifier = (req.body.phoneNumber || req.body.email || req.body.identifier || '').trim();
    const { otp } = req.body;

    if (!rawIdentifier || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number/email and OTP are required.',
      });
    }

    const isEmail = rawIdentifier.includes('@');
    const identifier = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    const result = otpService.verifyOtp(identifier, otp);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error in verifyOtp:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying OTP.',
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/signup
 * Body: { name: string, email?: string, phoneNumber?: string, referralCode?: string }
 */
async function signup(req, res) {
  try {
    const { name, email, phoneNumber, referralCode } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required.',
      });
    }

    if ((!email || !email.trim()) && (!phoneNumber || !phoneNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'At least an email address or phone number is required.',
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    const cleanPhone = phoneNumber && phoneNumber.trim() ? phoneNumber.trim() : null;

    // 1. Check if phone number already exists
    if (cleanPhone) {
      const phoneCheck = await db.query(
        'SELECT id FROM users WHERE phone_number = $1 LIMIT 1',
        [cleanPhone]
      );
      if (phoneCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Phone number is already registered. Please log in.',
        });
      }
    }

    // 2. Check if email already exists
    if (cleanEmail) {
      const emailCheck = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [cleanEmail]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email address is already registered. Please use another email or log in.',
        });
      }
    }

    // 3. Check Referral Code (if provided)
    let referrerUser = null;
    let initialBalance = 0.00;
    let initialReferralEarnings = 0.00;

    if (referralCode && referralCode.trim()) {
      const codeClean = referralCode.trim().toUpperCase();
      const refCheck = await db.query(
        'SELECT id, name, referral_code, phone_number, email FROM users WHERE UPPER(referral_code) = $1 LIMIT 1',
        [codeClean]
      );

      if (refCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code. Please enter a valid code or leave it empty.',
        });
      }

      referrerUser = refCheck.rows[0];

      // Prevent self-referral
      if (
        (cleanPhone && referrerUser.phone_number === cleanPhone) ||
        (cleanEmail && referrerUser.email && referrerUser.email.toLowerCase() === cleanEmail)
      ) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code.',
        });
      } // end self-referral check
    } // end referralCode block

    // 4. Generate unique referral code for the new user
    let myReferralCode = generateReferralCode(cleanName);
    let isCodeUnique = false;
    while (!isCodeUnique) {
      const exists = await db.query(
        'SELECT 1 FROM users WHERE referral_code = $1',
        [myReferralCode]
      );
      if (exists.rows.length === 0) {
        isCodeUnique = true;
      } else {
        myReferralCode = generateReferralCode(cleanName);
      }
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();

    // 5. Database Transaction for safe user creation
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO users (
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, referral_earnings, has_shopped,
          confirmed_cashback, pending_cashback, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, referral_earnings, has_shopped,
          confirmed_cashback, pending_cashback, avatar_url, created_at, updated_at;
      `;

      const result = await client.query(insertQuery, [
        userId,
        cleanName,
        cleanEmail || `user_${userId.substring(4, 12)}@kashiq.app`,
        cleanPhone,
        myReferralCode,
        referrerUser ? referrerUser.id : null,
        0,    // coins
        0.00, // wallet_balance: credited upon 1st shopping order
        0.00, // referral_earnings: credited upon 1st shopping order
        false, // has_shopped: FALSE for new user
        0.00,  // confirmed_cashback: 0.00
        0.00,  // pending_cashback: 0.00
        now,
        now,
      ]);

      const createdUser = result.rows[0];

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        message: referrerUser
          ? `Account created! Complete your 1st shopping order to earn ₹${REFEREE_BONUS.toFixed(0)} welcome bonus & reward your referrer!`
          : 'Account created successfully!',
        token: generateToken(createdUser.id),
        user: {
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          phoneNumber: createdUser.phone_number,
          referralCode: createdUser.referral_code,
          referredBy: createdUser.referred_by,
          walletBalance: parseFloat(createdUser.wallet_balance || 0),
          hasShopped: createdUser.has_shopped || false,
          confirmedCashback: parseFloat(createdUser.confirmed_cashback || 0),
          pendingCashback: parseFloat(createdUser.pending_cashback || 0),
          referralEarnings: parseFloat(createdUser.referral_earnings || 0),
          avatarUrl: createdUser.avatar_url,
          createdAt: createdUser.created_at,
          updatedAt: createdUser.updated_at,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in signup:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error while registering user.',
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/login
 * Body: { phoneNumber?: string, email?: string, identifier?: string }
 */
async function login(req, res) {
  try {
    const rawIdentifier = (req.body.phoneNumber || req.body.email || req.body.identifier || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Phone number or email is required.',
      });
    }

    const isEmail = rawIdentifier.includes('@');
    const identifier = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

    let result;
    if (isEmail) {
      result = await db.query(
        `SELECT
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, COALESCE(remaining_balance, wallet_balance, 0.00) as remaining_balance,
          has_shopped, confirmed_cashback,
          pending_cashback, referral_earnings,
          COALESCE(affiliate_earnings, 0.00) as affiliate_earnings,
          avatar_url, created_at, updated_at
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [identifier]
      );
    } else {
      const variants = getPhoneVariants(identifier);
      const clauses = variants.map((_, i) => `phone_number = $${i + 1}`).join(' OR ');
      result = await db.query(
        `SELECT
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, COALESCE(remaining_balance, wallet_balance, 0.00) as remaining_balance,
          has_shopped, confirmed_cashback,
          pending_cashback, referral_earnings,
          COALESCE(affiliate_earnings, 0.00) as affiliate_earnings,
          avatar_url, created_at, updated_at
         FROM users
         WHERE ${clauses}
         LIMIT 1`,
        variants
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        isRegistered: false,
        message: isEmail
          ? 'Email address is not registered. Please create an account.'
          : 'Phone number is not registered. Please create an account.',
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      isRegistered: true,
      message: 'Login successful.',
      user: formatUser(user),
    });
  } catch (error) {
    console.error('Error in login:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while logging in.',
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/google
 * Body: { email: string, name?: string, googleId?: string, photoUrl?: string, referralCode?: string }
 */
async function googleAuth(req, res) {
  try {
    const { email, name, googleId, photoUrl, referralCode } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for Google Sign-In.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0];

    // Check if user already exists with this email
    const existing = await db.query(
      `SELECT
        id, name, email, phone_number, referral_code, referred_by,
        coins, wallet_balance, COALESCE(remaining_balance, wallet_balance, 0.00) as remaining_balance,
        has_shopped, confirmed_cashback,
        pending_cashback, referral_earnings,
        COALESCE(affiliate_earnings, 0.00) as affiliate_earnings,
        google_id, avatar_url,
        created_at, updated_at
       FROM users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];

      // Update google_id and avatar_url if previously not stored
      if ((!existingUser.google_id && googleId) || (!existingUser.avatar_url && photoUrl)) {
        await db.query(
          `UPDATE users SET
             google_id = COALESCE(google_id, $1),
             avatar_url = COALESCE(avatar_url, $2),
             updated_at = NOW()
           WHERE id = $3`,
          [googleId || null, photoUrl || null, existingUser.id]
        );
        if (photoUrl && !existingUser.avatar_url) existingUser.avatar_url = photoUrl;
      }

      return res.status(200).json({
        success: true,
        isNewUser: false,
        message: 'Google Sign-In successful.',
        user: formatUser(existingUser),
      });
    }

    // New Google User - Sign up flow
    // Note: wallet_balance & referral_earnings start at 0.00 and are credited
    // only after the new user completes their 1st shopping order.
    let referrerUser = null;

    if (referralCode && referralCode.trim()) {
      const codeClean = referralCode.trim().toUpperCase();
      const refCheck = await db.query(
        'SELECT id, name, referral_code, email FROM users WHERE UPPER(referral_code) = $1 LIMIT 1',
        [codeClean]
      );

      if (refCheck.rows.length > 0) {
        const potentialRef = refCheck.rows[0];
        // Prevent self-referral
        if (!potentialRef.email || potentialRef.email.toLowerCase() !== cleanEmail) {
          referrerUser = potentialRef;
        }
      }
    }

    // Generate unique referral code
    let myReferralCode = generateReferralCode(cleanName);
    let isCodeUnique = false;
    while (!isCodeUnique) {
      const exists = await db.query(
        'SELECT 1 FROM users WHERE referral_code = $1',
        [myReferralCode]
      );
      if (exists.rows.length === 0) {
        isCodeUnique = true;
      } else {
        myReferralCode = generateReferralCode(cleanName);
      }
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const insertQuery = `
        INSERT INTO users (
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, referral_earnings, has_shopped,
          confirmed_cashback, pending_cashback, google_id, avatar_url,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING
          id, name, email, phone_number, referral_code, referred_by,
          coins, wallet_balance, referral_earnings, has_shopped,
          confirmed_cashback, pending_cashback, google_id, avatar_url,
          created_at, updated_at;
      `;

      const result = await client.query(insertQuery, [
        userId,
        cleanName,
        cleanEmail,
        null,
        myReferralCode,
        referrerUser ? referrerUser.id : null,
        0,    // coins
        0.00, // wallet_balance: credited upon 1st shopping order
        0.00, // referral_earnings: credited upon 1st shopping order
        false, // has_shopped: false
        0.00,
        0.00,
        googleId || null,
        photoUrl || null,
        now,
        now,
      ]);

      const createdUser = result.rows[0];

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        isNewUser: true,
        message: referrerUser
          ? `Welcome to KashIQ! Complete your 1st shopping order to earn ₹${REFEREE_BONUS.toFixed(0)} welcome cash bonus!`
          : 'Account created with Google successfully.',
        user: formatUser(createdUser),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in googleAuth:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during Google authentication.',
    });
  }
}

module.exports = {
  checkPhone,
  sendOtp,
  verifyOtp,
  signup,
  login,
  googleAuth,
};
