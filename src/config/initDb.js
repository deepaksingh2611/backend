const path = require('path');
const { Client, Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dbName = process.env.DB_NAME || 'cashback_db';
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || 'postgres';

async function initDatabase() {
  console.log(`Checking PostgreSQL connection at ${host}:${port} as ${user}...`);

  // 1. Connect to standard postgres database to ensure target DB exists
  const adminClient = new Client({
    host,
    port,
    database: 'postgres',
    user,
    password,
  });

  try {
    await adminClient.connect();
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" not found. Creating it...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.warn(`Admin DB check note: ${err.message}. Proceeding to direct connection...`);
  } finally {
    await adminClient.end().catch(() => {});
  }

  // 2. Connect to the target database and ensure schema is up to date
  const targetPool = new Pool({
    host,
    port,
    database: dbName,
    user,
    password,
  });

  try {
    // A. Users table base structure
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(32) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // B. Add Referral, Coins, Wallet & Cashback columns if not present
    await targetPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_shopped BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS confirmed_cashback NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_cashback NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_earnings NUMERIC(10, 2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(10, 2) DEFAULT 0.00;
      UPDATE users SET remaining_balance = wallet_balance WHERE remaining_balance IS NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
      ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);
    `);

    // C. Wallet Transactions table (Rupee-based audit trail)
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(30) DEFAULT 'CONFIRMED',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
    `);

    // Backwards compatibility: Coin Transactions table
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions(user_id);
    `);

    // D. Clicks / Shopping Trips Table (Sub-ID Tracking)
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS clicks (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
        store_name VARCHAR(100) NOT NULL,
        store_id VARCHAR(64),
        target_url TEXT NOT NULL,
        affiliate_url TEXT NOT NULL,
        sub_id VARCHAR(64) NOT NULL,
        network VARCHAR(50) DEFAULT 'generic',
        status VARCHAR(30) DEFAULT 'CLICKED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_clicks_user ON clicks(user_id);
      CREATE INDEX IF NOT EXISTS idx_clicks_sub_id ON clicks(sub_id);
      ALTER TABLE clicks ADD COLUMN IF NOT EXISTS link_type VARCHAR(30) DEFAULT 'SELF_SHOPPING';
      ALTER TABLE clicks ADD COLUMN IF NOT EXISTS referrer_id VARCHAR(64);
    `);

    // E. Cashback Orders / Sales Table (Postback Attribution)
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS cashback_orders (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
        click_id VARCHAR(64) REFERENCES clicks(id) ON DELETE SET NULL,
        store_name VARCHAR(100) NOT NULL,
        order_amount NUMERIC(10, 2) DEFAULT 0.00,
        commission_amount NUMERIC(10, 2) DEFAULT 0.00,
        cashback_amount NUMERIC(10, 2) DEFAULT 0.00,
        status VARCHAR(30) DEFAULT 'PENDING',
        network VARCHAR(50) DEFAULT 'generic',
        raw_postback JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON cashback_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_click ON cashback_orders(click_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON cashback_orders(status);
    `);

    // F. Backfill referral codes for existing users who don't have one yet
    const usersWithoutCode = await targetPool.query(
      'SELECT id, name FROM users WHERE referral_code IS NULL'
    );
    for (const u of usersWithoutCode.rows) {
      const prefix = (u.name || 'KASH')
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 4) || 'KASH';
      const code = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
      await targetPool.query(
        'UPDATE users SET referral_code = $1 WHERE id = $2',
        [code, u.id]
      );
    }

    // G. Initial welcome bonus & referral audit backfill (only if user has no transactions yet)
    const allUsers = await targetPool.query('SELECT id, name, referred_by, wallet_balance, referral_earnings FROM users');
    for (const u of allUsers.rows) {
      const existingTx = await targetPool.query(
        'SELECT 1 FROM wallet_transactions WHERE user_id = $1 LIMIT 1',
        [u.id]
      );
      if (existingTx.rowCount === 0) {
        const friendCountRes = await targetPool.query(
          'SELECT COUNT(*) FROM users WHERE referred_by = $1',
          [u.id]
        );
        const friendCount = parseInt(friendCountRes.rows[0].count, 10) || 0;
        const hasReferrer = u.referred_by !== null && u.referred_by.trim() !== '';
        const signupBonus = hasReferrer ? 10.00 : 0.00;
        const referralEarned = friendCount * 20.00;
        const totalReferral = signupBonus + referralEarned;

        await targetPool.query(
          `UPDATE users
           SET wallet_balance = COALESCE(wallet_balance, 0.00) + $1,
               referral_earnings = $2,
               coins = coins + $3
           WHERE id = $4`,
          [totalReferral, totalReferral, Math.round(totalReferral), u.id]
        );

        if (hasReferrer) {
          await targetPool.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, description)
             VALUES ($1, $2, $3, 'SIGNUP_BONUS', 'Welcome bonus in Rupees for signing up with referral code')`,
            [`wtx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, u.id, 10.00]
          );
        }
        if (friendCount > 0) {
          await targetPool.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, description)
             VALUES ($1, $2, $3, 'REFERRAL_REWARD', $4)`,
            [
              `wtx_${Date.now() + 1}_${Math.random().toString(36).substring(2, 8)}`,
              u.id,
              referralEarned,
              `Referral bonus in Rupees for inviting ${friendCount} friend(s) (₹20 each)`,
            ]
          );
        }
      }
    }

    console.log('PostgreSQL "users" and "wallet_transactions" tables initialized and synchronized in Rupees successfully.');
  } catch (err) {
    console.error('Failed to initialize database schema:', err.message);
    throw err;
  } finally {
    await targetPool.end();
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database initialization completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Database initialization failed:', err);
      process.exit(1);
    });
}

module.exports = initDatabase;
