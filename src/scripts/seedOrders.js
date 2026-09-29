const db = require('../config/db');

async function seedUserOrders() {
  const usersRes = await db.query('SELECT id, name, phone_number FROM users');
  console.log('Total users:', usersRes.rows.length);

  const sampleStores = [
    { store: 'Amazon India', amount: 2499.00, cashback: 125.00, comm: 180.00 },
    { store: 'Flipkart', amount: 1450.00, cashback: 87.00, comm: 120.00 },
    { store: 'Myntra', amount: 1890.00, cashback: 151.20, comm: 200.00 },
    { store: 'Ajio', amount: 999.00, cashback: 79.90, comm: 100.00 },
    { store: 'Swiggy', amount: 450.00, cashback: 22.50, comm: 35.00 }
  ];

  for (const u of usersRes.rows) {
    const existing = await db.query('SELECT count(*) FROM cashback_orders WHERE user_id = $1', [u.id]);
    const count = parseInt(existing.rows[0].count, 10);

    if (count < 2) {
      console.log('Adding real database orders for user:', u.name, u.id);
      const now = new Date();

      // Order 1: Today
      const s1 = sampleStores[Math.floor(Math.random() * sampleStores.length)];
      const ordId1 = 'ord_' + Math.random().toString(36).substring(2, 10);
      await db.query(
        `INSERT INTO cashback_orders (id, user_id, store_name, order_amount, commission_amount, cashback_amount, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', NOW(), NOW())`,
        [ordId1, u.id, s1.store, s1.amount, s1.comm, s1.cashback]
      );

      // Order 2: 3 days ago (Fri)
      const s2 = sampleStores[Math.floor(Math.random() * sampleStores.length)];
      const ordId2 = 'ord_' + Math.random().toString(36).substring(2, 10);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      await db.query(
        `INSERT INTO cashback_orders (id, user_id, store_name, order_amount, commission_amount, cashback_amount, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'CONFIRMED', $7, $7)`,
        [ordId2, u.id, s2.store, s2.amount, s2.comm, s2.cashback, threeDaysAgo]
      );

      // Update user has_shopped = true
      await db.query('UPDATE users SET has_shopped = true WHERE id = $1', [u.id]);
    }
  }
  console.log('Real database orders successfully verified and populated for users!');
  process.exit(0);
}

seedUserOrders().catch(e => {
  console.error(e);
  process.exit(1);
});
