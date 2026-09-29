const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function viewUsers() {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone_number, referral_code, referred_by, wallet_balance, referral_earnings, has_shopped, created_at FROM users ORDER BY created_at DESC'
    );

    console.log('\n=================== POSTGRESQL USERS TABLE (RUPEES) ===================');
    console.log(`Total Users Found: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
      console.log('No users registered yet.');
    } else {
      console.table(result.rows);
    }
    console.log('=======================================================================\n');
  } catch (error) {
    console.error('Error querying users table:', error.message);
  } finally {
    await pool.end();
  }
}

viewUsers();
