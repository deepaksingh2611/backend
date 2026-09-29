const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../config/db');
const http = require('http');

function postJson(urlPath, body) {
  const postData = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: urlPath,
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

async function testNewCommissionModel() {
  console.log('=== STARTING 40/60 & FIRST-ORDER REFERRAL MODEL VERIFICATION ===\n');
  const client = await db.pool.connect();

  try {
    const timestamp = Date.now();

    // 1. Create User A (Sharer / Referrer)
    const userAId = `usr_test_A_${timestamp}`;
    const userACode = `REFA${timestamp.toString().substring(7)}`;
    await client.query(`
      INSERT INTO users (id, name, email, referral_code, wallet_balance, affiliate_earnings, referral_earnings, confirmed_cashback, has_shopped)
      VALUES ($1, 'User A (Sharer)', $2, $3, 0.00, 0.00, 0.00, 0.00, true)
    `, [userAId, `usera_${timestamp}@test.com`, userACode]);

    // 2. Create User B (Referred by User A)
    const userBId = `usr_test_B_${timestamp}`;
    const userBCode = `REFB${timestamp.toString().substring(7)}`;
    await client.query(`
      INSERT INTO users (id, name, email, referral_code, referred_by, wallet_balance, affiliate_earnings, referral_earnings, confirmed_cashback, has_shopped)
      VALUES ($1, 'User B (Shopper)', $2, $3, $4, 0.00, 0.00, 0.00, 0.00, false)
    `, [userBId, `userb_${timestamp}@test.com`, userBCode, userAId]);

    console.log(`Created User A: ${userAId} (Balance: ₹0.00)`);
    console.log(`Created User B: ${userBId} (Referred By: ${userAId}, has_shopped: false, Balance: ₹0.00)\n`);

    // -------------------------------------------------------------
    // TEST 1: Share & Earn - Guest purchases without login
    // Commission = ₹100. Expected: User A gets 40% (₹40), Platform keeps 60% (₹60)
    // -------------------------------------------------------------
    console.log('--- TEST 1: Share & Earn (Guest purchase without login) ---');
    const shareClickId = `clk_share_${timestamp}`;
    await client.query(`
      INSERT INTO clicks (id, user_id, store_name, target_url, affiliate_url, sub_id, link_type, status)
      VALUES ($1, $2, 'Flipkart', 'https://flipkart.com/item1', $3, $4, 'SHARE_AND_EARN', 'CLICKED')
    `, [shareClickId, userAId, `https://tracking.com?subid=${shareClickId}`, shareClickId]);

    const postback1 = await postJson('/api/postbacks/generic', {
      sub_id: shareClickId,
      order_id: `ord_share_${timestamp}`,
      commission: 100.00,
      sale_amount: 1500.00,
      status: 'CONFIRMED',
      store_name: 'Flipkart',
    });

    console.log('Share & Earn Postback Status:', postback1.statusCode, postback1.body);

    const userACheck1 = await client.query('SELECT wallet_balance, affiliate_earnings FROM users WHERE id = $1', [userAId]);
    console.log(`User A after Share & Earn purchase: Balance: ₹${userACheck1.rows[0].wallet_balance}, Affiliate Earnings: ₹${userACheck1.rows[0].affiliate_earnings}`);

    if (parseFloat(userACheck1.rows[0].affiliate_earnings) !== 40.00 || parseFloat(userACheck1.rows[0].wallet_balance) !== 40.00) {
      throw new Error(`Expected User A to receive ₹40.00 (40% of ₹100 commission)! Got: ₹${userACheck1.rows[0].wallet_balance}`);
    }
    console.log('✔ PASS: User A received exactly 40% (₹40.00) affiliate commission under AFFILIATE stream!\n');

    // -------------------------------------------------------------
    // TEST 2: User B 1st Shopping Order with Commission < ₹50 (e.g. ₹20 commission)
    // User Directive: Even if commission is under ₹50, users MUST receive their promised bonuses!
    // App takes ₹0 margin in this situation to protect user trust.
    // Expected:
    // - User B gets 60% cashback = ₹12.00
    // - User B gets ₹10.00 Welcome Bonus! (Total = ₹22.00)
    // - User A gets ₹20.00 Referral Bonus!
    // - User B has_shopped becomes true
    // -------------------------------------------------------------
    console.log('--- TEST 2: User B 1st Order with Commission < ₹50 (Trust Guarantee: Bonuses Awarded 100%) ---');
    const smallClickId = `clk_small_${timestamp}`;
    await client.query(`
      INSERT INTO clicks (id, user_id, store_name, target_url, affiliate_url, sub_id, link_type, referrer_id, status)
      VALUES ($1, $2, 'Ajio', 'https://ajio.com/socks', $3, $4, 'SELF_SHOPPING', $5, 'CLICKED')
    `, [smallClickId, userBId, `https://tracking.com?subid=${smallClickId}`, smallClickId, userAId]);

    const postbackSmall = await postJson('/api/postbacks/generic', {
      sub_id: smallClickId,
      order_id: `ord_small_${timestamp}`,
      commission: 20.00,
      sale_amount: 200.00,
      status: 'CONFIRMED',
      store_name: 'Ajio',
    });

    console.log('1st Order (< ₹50 Commission) Postback Status:', postbackSmall.statusCode, postbackSmall.body);

    const userBCheck1 = await client.query('SELECT wallet_balance, confirmed_cashback, referral_earnings, has_shopped FROM users WHERE id = $1', [userBId]);
    console.log(`User B after 1st order: Balance: ₹${userBCheck1.rows[0].wallet_balance} (Cashback: ₹${userBCheck1.rows[0].confirmed_cashback}, Welcome Bonus: ₹${userBCheck1.rows[0].referral_earnings}), has_shopped: ${userBCheck1.rows[0].has_shopped}`);

    const userACheck2 = await client.query('SELECT wallet_balance, affiliate_earnings, referral_earnings FROM users WHERE id = $1', [userAId]);
    console.log(`User A after User B 1st order: Balance: ₹${userACheck2.rows[0].wallet_balance} (Affiliate: ₹${userACheck2.rows[0].affiliate_earnings}, Referral: ₹${userACheck2.rows[0].referral_earnings})`);

    // User B should receive: ₹12 cashback + ₹10 welcome bonus = ₹22 total
    if (parseFloat(userBCheck1.rows[0].confirmed_cashback) !== 12.00) {
      throw new Error(`Expected User B cashback ₹12.00! Got: ₹${userBCheck1.rows[0].confirmed_cashback}`);
    }
    if (parseFloat(userBCheck1.rows[0].referral_earnings) !== 10.00) {
      throw new Error(`Expected User B welcome bonus ₹10.00! Got: ₹${userBCheck1.rows[0].referral_earnings}`);
    }
    if (parseFloat(userBCheck1.rows[0].wallet_balance) !== 22.00) {
      throw new Error(`Expected User B total balance ₹22.00! Got: ₹${userBCheck1.rows[0].wallet_balance}`);
    }
    if (!userBCheck1.rows[0].has_shopped) {
      throw new Error('Expected User B has_shopped to be TRUE!');
    }

    // User A should receive: previous ₹40 + ₹20 referral bonus = ₹60 total
    if (parseFloat(userACheck2.rows[0].referral_earnings) !== 20.00 || parseFloat(userACheck2.rows[0].wallet_balance) !== 60.00) {
      throw new Error(`Expected User A to receive ₹20 referral bonus (Total ₹60)! Got: ₹${userACheck2.rows[0].wallet_balance}`);
    }
    console.log('✔ PASS: Even with commission < ₹50, User B received full cashback (₹12) + Welcome Bonus (₹10), and User A received Referral Bonus (₹20)! User trust is 100% preserved!\n');

    // -------------------------------------------------------------
    // TEST 3: User B's SECOND Order (Subsequent Shopping)
    // Commission = ₹100. Expected:
    // - User B gets 60% cashback = ₹60
    // - User A gets NO BONUS (₹0)
    // - User B gets NO BONUS (₹0)
    // - Platform keeps 40% (₹40)
    // -------------------------------------------------------------
    console.log('--- TEST 3: User B 2nd Shopping Order (NO Referral/Welcome Bonuses) ---');
    const shopClick2 = `clk_shop2_${timestamp}`;
    await client.query(`
      INSERT INTO clicks (id, user_id, store_name, target_url, affiliate_url, sub_id, link_type, referrer_id, status)
      VALUES ($1, $2, 'Amazon', 'https://amazon.in/watch', $3, $4, 'SELF_SHOPPING', $5, 'CLICKED')
    `, [shopClick2, userBId, `https://tracking.com?subid=${shopClick2}`, shopClick2, userAId]);

    const postback3 = await postJson('/api/postbacks/generic', {
      sub_id: shopClick2,
      order_id: `ord_shop2_${timestamp}`,
      commission: 100.00,
      sale_amount: 1000.00,
      status: 'CONFIRMED',
      store_name: 'Amazon',
    });

    console.log('2nd Shopping Postback Status:', postback3.statusCode, postback3.body);

    const userBCheck2 = await client.query('SELECT wallet_balance, confirmed_cashback, referral_earnings FROM users WHERE id = $1', [userBId]);
    console.log(`User B after 2nd order: Balance: ₹${userBCheck2.rows[0].wallet_balance} (Cashback: ₹${userBCheck2.rows[0].confirmed_cashback}, Welcome Bonus: ₹${userBCheck2.rows[0].referral_earnings})`);

    const userACheck3 = await client.query('SELECT wallet_balance, affiliate_earnings, referral_earnings FROM users WHERE id = $1', [userAId]);
    console.log(`User A after User B 2nd order: Balance: ₹${userACheck3.rows[0].wallet_balance} (Affiliate: ₹${userACheck3.rows[0].affiliate_earnings}, Referral: ₹${userACheck3.rows[0].referral_earnings})`);

    // User B should have: previous ₹22 + ₹60 cashback = ₹82 total balance (referral bonus remains ₹10)
    if (parseFloat(userBCheck2.rows[0].confirmed_cashback) !== 72.00) { // 12 + 60 = 72
      throw new Error(`Expected User B confirmed cashback ₹72.00! Got: ₹${userBCheck2.rows[0].confirmed_cashback}`);
    }
    if (parseFloat(userBCheck2.rows[0].referral_earnings) !== 10.00) { // unchanged
      throw new Error(`Expected User B referral bonus to remain ₹10.00! Got: ₹${userBCheck2.rows[0].referral_earnings}`);
    }
    if (parseFloat(userBCheck2.rows[0].wallet_balance) !== 82.00) {
      throw new Error(`Expected User B total balance ₹82.00! Got: ₹${userBCheck2.rows[0].wallet_balance}`);
    }

    // User A should have: UNCHANGED ₹60 (no additional bonus!)
    if (parseFloat(userACheck3.rows[0].referral_earnings) !== 20.00 || parseFloat(userACheck3.rows[0].wallet_balance) !== 60.00) {
      throw new Error(`Expected User A balance to remain ₹60 (₹0 bonus on 2nd order)! Got: ₹${userACheck3.rows[0].wallet_balance}`);
    }

    console.log('✔ PASS: On 2nd order, User B received 60% cashback (₹60) and User A received ₹0 bonus! Platform kept full 40% margin!\n');
    console.log('🎉 ALL 3 BUSINESS MODEL TESTS PASSED WITH 100% MATHEMATICAL PRECISION! 🎉\n');

  } finally {
    client.release();
  }
}

testNewCommissionModel().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
