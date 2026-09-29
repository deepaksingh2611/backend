const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/db');
const http = require('http');

async function testReferralFlow() {
  console.log('=== STARTING REFERRAL & COINS SYSTEM VERIFICATION ===\n');

  try {
    // 1. Fetch existing user 'shivam' who owns referral code 'SHIV3186'
    const referrerRes = await db.query(
      "SELECT id, name, phone_number, referral_code, coins FROM users WHERE UPPER(referral_code) = 'SHIV3186' LIMIT 1"
    );

    if (referrerRes.rows.length === 0) {
      console.error("Referrer with code 'SHIV3186' not found. Please run npm run init-db first.");
      process.exit(1);
    }

    const referrer = referrerRes.rows[0];
    const referrerCoinsBefore = referrer.coins || 0;
    console.log(`[Referrer Before] ID: ${referrer.id}, Name: ${referrer.name}, Code: ${referrer.referral_code}, Coins: ${referrerCoinsBefore}`);

    // Generate unique test user phone and email
    const testPhone = `+9199${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testEmail = `test_referral_${Date.now()}@example.com`;
    const testName = 'Aarav Test';

    console.log(`\n[New User Signup] Registering ${testName} with code: ${referrer.referral_code}...`);

    // 2. Perform HTTP POST /api/auth/signup using native http or directly through controller logic
    const postData = JSON.stringify({
      name: testName,
      email: testEmail,
      phoneNumber: testPhone,
      referralCode: referrer.referral_code,
    });

    const signupResponse = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5000,
          path: '/api/auth/signup',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
            } catch (e) {
              resolve({ statusCode: res.statusCode, body });
            }
          });
        }
      );

      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    console.log(`Signup Status Code: ${signupResponse.statusCode}`);
    console.log(`Signup Response:`, JSON.stringify(signupResponse.body, null, 2));

    if (signupResponse.statusCode !== 201) {
      throw new Error(`Signup failed: ${JSON.stringify(signupResponse.body)}`);
    }

    const newUser = signupResponse.body.user;

    // 3. Verify New User has 25 coins
    console.log('\n--- VERIFICATION 1: Referee (New User) Coins ---');
    console.log(`Expected: 25 coins, Actual: ${newUser.coins} coins`);
    if (newUser.coins !== 25) {
      throw new Error(`Expected 25 coins for new user, got: ${newUser.coins}`);
    }
    console.log('✔ PASS: New user received 25 welcome coins!');

    // 4. Verify Referrer (Code owner) received +50 coins
    console.log('\n--- VERIFICATION 2: Referrer (Code Owner) Coins ---');
    const referrerAfterRes = await db.query(
      'SELECT id, name, referral_code, coins FROM users WHERE id = $1',
      [referrer.id]
    );
    const referrerCoinsAfter = referrerAfterRes.rows[0].coins || 0;
    console.log(`Referrer coins before: ${referrerCoinsBefore}, after: ${referrerCoinsAfter}`);
    if (referrerCoinsAfter !== referrerCoinsBefore + 50) {
      throw new Error(`Expected referrer coins to increase by 50, but went from ${referrerCoinsBefore} to ${referrerCoinsAfter}`);
    }
    console.log('✔ PASS: Referrer received +50 reward coins!');

    // 5. Verify Coin Transactions Audit Log
    console.log('\n--- VERIFICATION 3: Coin Transactions Audit Table ---');
    const txRes = await db.query(
      'SELECT * FROM coin_transactions WHERE user_id = $1 OR user_id = $2 ORDER BY created_at DESC LIMIT 4',
      [referrer.id, newUser.id]
    );
    console.table(txRes.rows.map(tx => ({
      ID: tx.id,
      User: tx.user_id === referrer.id ? 'Referrer' : 'New User',
      Amount: tx.amount,
      Type: tx.type,
      Description: tx.description,
    })));

    const referrerTx = txRes.rows.find(t => t.user_id === referrer.id && t.type === 'REFERRAL_REWARD');
    const refereeTx = txRes.rows.find(t => t.user_id === newUser.id && t.type === 'SIGNUP_BONUS');

    if (!referrerTx || referrerTx.amount !== 50) {
      throw new Error('Referrer transaction (+50) log missing!');
    }
    if (!refereeTx || refereeTx.amount !== 25) {
      throw new Error('Referee transaction (+25) log missing!');
    }
    console.log('✔ PASS: Both transaction logs recorded accurately!');

    // 6. Verify GET /api/users/:id/referrals endpoint
    console.log('\n--- VERIFICATION 4: GET /api/users/:id/referrals ---');
    const refEndpointResponse = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:5000/api/users/${referrer.id}/referrals`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      }).on('error', reject);
    });

    console.log(`Referrals API Status: ${refEndpointResponse.statusCode}`);
    console.log(`Referrals API Body:`, JSON.stringify(refEndpointResponse.body, null, 2));

    if (refEndpointResponse.statusCode !== 200 || !refEndpointResponse.body.success) {
      throw new Error('GET /api/users/:id/referrals failed!');
    }
    console.log('✔ PASS: Referrals endpoint returned full referral stats!');

    console.log('\n🎉 ALL REFERRAL & COINS TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

testReferralFlow();
