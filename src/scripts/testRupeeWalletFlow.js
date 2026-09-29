const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/db');
const http = require('http');

function postJson(path, body) {
  const postData = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(resBody) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:5000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function testRupeeWalletFlow() {
  console.log('=== STARTING RUPEE REFERRAL & WALLET BACKEND VERIFICATION ===\n');

  try {
    // -------------------------------------------------------------
    // TEST 1: New User WITHOUT Referral (Must have ₹0.00 Balance & No Shopping)
    // -------------------------------------------------------------
    console.log('--- TEST 1: New User Signup WITHOUT Referral Code ---');
    const phone1 = `+9188${Math.floor(10000000 + Math.random() * 90000000)}`;
    const email1 = `newuser_zero_${Date.now()}@example.com`;
    const name1 = 'Pooja Zero';

    const res1 = await postJson('/api/auth/signup', {
      name: name1,
      email: email1,
      phoneNumber: phone1,
    });

    console.log(`Signup Status: ${res1.statusCode}`);
    if (res1.statusCode !== 201 || !res1.body.success) {
      throw new Error(`Test 1 Failed on signup: ${JSON.stringify(res1.body)}`);
    }

    const user1 = res1.body.user;
    console.log(`User created: ${user1.name} (ID: ${user1.id})`);
    console.log(`Wallet Balance: ₹${user1.walletBalance} (Expected: 0)`);
    console.log(`Has Shopped: ${user1.hasShopped} (Expected: false)`);

    if (user1.walletBalance !== 0 || user1.hasShopped !== false) {
      throw new Error(`Expected zero balance and hasShopped=false for user without referral/shopping!`);
    }

    // Check GET /api/users/:id/wallet
    const walletRes1 = await getJson(`/api/users/${user1.id}/wallet`);
    console.log(`Wallet API Response:`, walletRes1.body);
    if (walletRes1.body.wallet.balance !== 0 || walletRes1.body.wallet.hasShopped !== false) {
      throw new Error(`Wallet API returned non-zero balance for new user!`);
    }
    console.log('✔ PASS: New user without shopping has strictly ₹0.00 in wallet!\n');

    // -------------------------------------------------------------
    // TEST 2: New User WITH Referral Code (Referee gets ₹10, Referrer gets ₹20)
    // -------------------------------------------------------------
    console.log('--- TEST 2: Referral Flow (Referee: ₹10, Referrer: ₹20) ---');
    // Fetch an existing referrer (e.g., shivam)
    const refRes = await db.query(
      "SELECT id, name, referral_code, wallet_balance FROM users WHERE UPPER(referral_code) = 'SHIV3186' LIMIT 1"
    );
    if (refRes.rows.length === 0) {
      throw new Error('Referrer SHIV3186 not found.');
    }
    const referrer = refRes.rows[0];
    const referrerBalanceBefore = parseFloat(referrer.wallet_balance || 0);
    console.log(`Referrer Before: ${referrer.name} (Code: ${referrer.referral_code}), Balance: ₹${referrerBalanceBefore}`);

    const phone2 = `+9177${Math.floor(10000000 + Math.random() * 90000000)}`;
    const email2 = `referee_user_${Date.now()}@example.com`;
    const name2 = 'Rohan Referee';

    const res2 = await postJson('/api/auth/signup', {
      name: name2,
      email: email2,
      phoneNumber: phone2,
      referralCode: referrer.referral_code,
    });

    console.log(`Signup with Referral Status: ${res2.statusCode}`);
    if (res2.statusCode !== 201 || !res2.body.success) {
      throw new Error(`Test 2 Failed on signup: ${JSON.stringify(res2.body)}`);
    }

    const refereeUser = res2.body.user;
    console.log(`Referee created: ${refereeUser.name}, Balance: ₹${refereeUser.walletBalance} (Expected: 10)`);
    if (refereeUser.walletBalance !== 10) {
      throw new Error(`Referee expected to receive ₹10, but got: ₹${refereeUser.walletBalance}`);
    }

    // Verify Referrer received +₹20
    const referrerAfterRes = await db.query(
      'SELECT id, name, wallet_balance, referral_earnings FROM users WHERE id = $1',
      [referrer.id]
    );
    const referrerBalanceAfter = parseFloat(referrerAfterRes.rows[0].wallet_balance || 0);
    console.log(`Referrer After: Balance was ₹${referrerBalanceBefore}, now ₹${referrerBalanceAfter} (Expected +20)`);
    if (referrerBalanceAfter !== referrerBalanceBefore + 20) {
      throw new Error(`Referrer expected to gain ₹20, but changed from ${referrerBalanceBefore} to ${referrerBalanceAfter}`);
    }
    console.log('✔ PASS: Referee got ₹10 and Referrer got ₹20 in wallet!\n');

    // -------------------------------------------------------------
    // TEST 3: Verify Wallet API and Referrals API in Rupees
    // -------------------------------------------------------------
    console.log('--- TEST 3: Verify Wallet & Referral Endpoints in Rupees ---');
    const refereeWallet = await getJson(`/api/users/${refereeUser.id}/wallet`);
    console.log('Referee Wallet API:', refereeWallet.body.wallet);
    if (refereeWallet.body.wallet.balance !== 10 || refereeWallet.body.wallet.referralEarnings !== 10) {
      throw new Error('Referee wallet endpoint values mismatch!');
    }

    const referrerRefEndpoint = await getJson(`/api/users/${referrer.id}/referrals`);
    console.log('Referrer Referrals API:', {
      referralCode: referrerRefEndpoint.body.referralCode,
      referralEarnings: referrerRefEndpoint.body.referralEarnings,
      referrerReward: referrerRefEndpoint.body.referrerReward,
      refereeReward: referrerRefEndpoint.body.refereeReward,
      totalReferred: referrerRefEndpoint.body.totalReferred,
    });

    if (
      referrerRefEndpoint.body.referrerReward !== 20 ||
      referrerRefEndpoint.body.refereeReward !== 10
    ) {
      throw new Error('Referral reward constants mismatch in API!');
    }

    console.log('\n🎉 ALL BACKEND RUPEE REFERRAL & ZERO-BALANCE WALLET TESTS PASSED! 🎉\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

testRupeeWalletFlow();
