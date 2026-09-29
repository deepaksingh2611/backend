-- Users Table Schema
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(32) UNIQUE,
    referral_code VARCHAR(20) UNIQUE,
    referred_by VARCHAR(64),
    coins INTEGER DEFAULT 0,
    wallet_balance NUMERIC(10, 2) DEFAULT 0.00,
    remaining_balance NUMERIC(10, 2) DEFAULT 0.00,
    has_shopped BOOLEAN DEFAULT FALSE,
    confirmed_cashback NUMERIC(10, 2) DEFAULT 0.00,
    pending_cashback NUMERIC(10, 2) DEFAULT 0.00,
    referral_earnings NUMERIC(10, 2) DEFAULT 0.00,
    affiliate_earnings NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);

-- Wallet & Cash Transactions Table (Rupee Currency Auditing)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'SIGNUP_BONUS', 'REFERRAL_REWARD', 'CASHBACK_CONFIRMED', 'CASHBACK_PENDING', 'WITHDRAWAL'
    status VARCHAR(30) DEFAULT 'CONFIRMED',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);

-- Backwards compatibility: Coin Transactions Table
CREATE TABLE IF NOT EXISTS coin_transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions(user_id);

-- Clicks / Shopping Trips Table (Sub-ID Tracking)
CREATE TABLE IF NOT EXISTS clicks (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    store_name VARCHAR(100) NOT NULL,
    store_id VARCHAR(64),
    target_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    sub_id VARCHAR(64) NOT NULL,
    network VARCHAR(50) DEFAULT 'generic',
    link_type VARCHAR(30) DEFAULT 'SELF_SHOPPING',
    referrer_id VARCHAR(64),
    status VARCHAR(30) DEFAULT 'CLICKED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clicks_user ON clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_clicks_sub_id ON clicks(sub_id);

-- Cashback Orders / Conversions Table (Postback Attribution)
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
