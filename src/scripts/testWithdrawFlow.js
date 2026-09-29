const db = require('../config/db');
const userController = require('../controllers/userController');

async function testWithdrawal() {
  const testUserId = 'usr_f0862db42a6f49f7';
  await db.query('UPDATE users SET wallet_balance = 300.00, confirmed_cashback = 300.00 WHERE id = $1', [testUserId]);

  const req = {
    params: { id: testUserId },
    body: { amount: 250, method: 'UPI', paymentDetails: 'deepak@okhdfcbank' }
  };
  let statusCode = 200;
  let responseJson = {};
  const res = {
    status: (c) => { statusCode = c; return res; },
    json: (j) => { responseJson = j; return res; }
  };

  await userController.withdrawWalletBalance(req, res);
  console.log('Status Code:', statusCode);
  console.log('Response:', responseJson);

  const userRes = await db.query('SELECT wallet_balance, confirmed_cashback FROM users WHERE id = $1', [testUserId]);
  console.log('Post-withdrawal balances:', userRes.rows[0]);

  const txRes = await db.query('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [testUserId]);
  console.log('Latest Transaction in DB:', txRes.rows[0]);

  process.exit(0);
}

testWithdrawal().catch(e => {
  console.error(e);
  process.exit(1);
});
