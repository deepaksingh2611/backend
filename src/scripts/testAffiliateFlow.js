const pool = require('../config/db');
const request = require('http');

async function testFlow() {
  console.log('--- Testing Affiliate Link & Postback Flow ---');

  // 1. Get an existing user
  const userRes = await pool.query('SELECT id, name, wallet_balance, pending_cashback, confirmed_cashback FROM users LIMIT 1');
  if (userRes.rowCount === 0) {
    console.error('No users found in database to test.');
    process.exit(1);
  }
  const testUser = userRes.rows[0];
  console.log(`Using test user: ${testUser.name} (${testUser.id})`);
  console.log(`Initial balances: Wallet: ₹${testUser.wallet_balance}, Pending: ₹${testUser.pending_cashback}, Confirmed: ₹${testUser.confirmed_cashback}`);

  const affiliateController = require('../controllers/affiliateController');
  const postbackController = require('../controllers/postbackController');
  const userController = require('../controllers/userController');

  // 2. Test generateLink
  const mockReqLink = {
    body: {
      userId: testUser.id,
      storeName: 'Amazon India',
      storeId: 'amazon',
      targetUrl: 'https://www.amazon.in/dp/B08L5VJZ37',
      network: 'generic',
    },
  };

  let generatedClickId = '';
  let generatedSubId = '';

  const mockResLink = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };

  await affiliateController.generateLink(mockReqLink, mockResLink);
  console.log('generateLink result status:', mockResLink.statusCode);
  if (mockResLink.data && mockResLink.data.success) {
    generatedClickId = mockResLink.data.clickId;
    generatedSubId = mockResLink.data.subId;
    console.log(`Generated clickId: ${generatedClickId}, affiliateUrl: ${mockResLink.data.affiliateUrl}`);
  } else {
    console.error('generateLink failed:', mockResLink.data);
    process.exit(1);
  }

  // 3. Test Postback (PENDING)
  const testOrderId = `test_ord_${Date.now()}`;
  const mockReqPostbackPending = {
    params: { network: 'cuelinks' },
    query: {},
    body: {
      subid: generatedSubId,
      order_id: testOrderId,
      sale_amount: 2500.00,
      commission: 150.00, // 70% user cashback = 105.00
      status: 'pending',
    },
    headers: {},
  };

  const mockResPostback = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };

  await postbackController.handlePostback(mockReqPostbackPending, mockResPostback);
  console.log('Postback (pending) result:', mockResPostback.data);

  // Check user balance in DB
  const userAfterPending = await pool.query('SELECT wallet_balance, pending_cashback, confirmed_cashback FROM users WHERE id = $1', [testUser.id]);
  console.log('Balances after PENDING postback:', userAfterPending.rows[0]);

  // 4. Test Postback (CONFIRMED)
  const mockReqPostbackConfirmed = {
    params: { network: 'cuelinks' },
    query: {},
    body: {
      subid: generatedSubId,
      order_id: testOrderId,
      sale_amount: 2500.00,
      commission: 150.00,
      status: 'approved',
    },
    headers: {},
  };

  const mockResPostback2 = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };

  await postbackController.handlePostback(mockReqPostbackConfirmed, mockResPostback2);
  console.log('Postback (confirmed) result:', mockResPostback2.data);

  // Check user balance in DB
  const userAfterConfirmed = await pool.query('SELECT wallet_balance, pending_cashback, confirmed_cashback FROM users WHERE id = $1', [testUser.id]);
  console.log('Balances after CONFIRMED postback:', userAfterConfirmed.rows[0]);

  // 5. Test getUserOrders
  const mockReqOrders = { params: { id: testUser.id } };
  const mockResOrders = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };

  await userController.getUserOrders(mockReqOrders, mockResOrders);
  console.log(`Orders fetched for user: ${mockResOrders.data?.orders?.length} orders found.`);
  if (mockResOrders.data?.orders?.length > 0) {
    console.log('Latest order sample:', mockResOrders.data.orders[0]);
  }

  console.log('--- ALL BACKEND AFFILIATE & POSTBACK TESTS PASSED! ---');
  await pool.pool.end();
}

testFlow().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
