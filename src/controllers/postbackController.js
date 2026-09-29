const db = require('../config/db');

/**
 * Handles incoming postback / webhook notification from affiliate networks.
 * Supports both GET query parameters and POST JSON body.
 * ALL /api/postbacks/:network?
 */
exports.handlePostback = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const network = (req.params.network || req.query.network || req.body.network || 'generic').toLowerCase();
    const data = { ...req.query, ...req.body };

    console.log(`[POSTBACK RECEIVED] Network: ${network}`, JSON.stringify(data));

    // Optional Security Token Check
    const secretToken = process.env.POSTBACK_SECRET_TOKEN;
    const providedToken = data.token || data.secret || data.security_token || req.headers['x-postback-token'];
    if (secretToken && providedToken !== secretToken) {
      console.warn('[POSTBACK ERROR] Unauthorized token:', providedToken);
      return res.status(401).json({
        success: false,
        message: 'Invalid security token for postback verification.',
      });
    }

    // Extract sub_id / click_id across multiple affiliate network naming formats
    const subId = (
      data.subid ||
      data.sub_id ||
      data.aff_sub ||
      data.click_id ||
      data.clickId ||
      data.s1 ||
      data.sid ||
      ''
    ).toString().trim();

    if (!subId) {
      return res.status(400).json({
        success: false,
        message: 'Missing sub_id / click_id parameter in postback payload.',
      });
    }

    // Find the original click record with link_type and referrer_id
    const clickRes = await client.query(
      'SELECT id, user_id, store_name, store_id, link_type, referrer_id FROM clicks WHERE sub_id = $1 OR id = $1 LIMIT 1',
      [subId]
    );

    if (clickRes.rowCount === 0) {
      console.warn(`[POSTBACK NOTE] Click not found for sub_id "${subId}". Logging unlinked conversion.`);
      return res.status(404).json({
        success: false,
        message: `No active click found matching sub_id "${subId}".`,
      });
    }

    const click = clickRes.rows[0];
    const userId = click.user_id;
    const storeName = click.store_name || data.store_name || data.merchant || 'Partner Store';
    const isShareAndEarn = (click.link_type || '').toUpperCase() === 'SHARE_AND_EARN';

    // Extract order identifier
    const orderId = (
      data.order_id ||
      data.orderId ||
      data.tx_id ||
      data.transaction_id ||
      data.conversion_id ||
      `ord_${Date.now()}`
    ).toString().trim();

    // Financial amounts
    const saleAmount = parseFloat(data.sale_amount || data.amount || data.order_amount || data.cart_value || 0) || 0.0;
    const commission = parseFloat(data.commission || data.payout || data.revenue || 0) || 0.0;

    // Normalizing status
    const statusRaw = (data.status || data.conversion_status || 'pending').toString().toLowerCase().trim();
    let orderStatus = 'PENDING';
    if (['approved', 'confirmed', 'paid', 'success', 'credited'].includes(statusRaw)) {
      orderStatus = 'CONFIRMED';
    } else if (['rejected', 'cancelled', 'canceled', 'declined', 'trash'].includes(statusRaw)) {
      orderStatus = 'REJECTED';
    }

    // Commission Distribution Logic:
    // 1. Share & Earn (Guest purchase without login via shared link):
    //    Sharer User A gets 40% of commission; Platform keeps 60%.
    // 2. Normal Shopping (Logged-in User B shopping):
    //    Shopper User B gets 60% cashback; Platform keeps 40%.
    let userPayout = 0.0;
    if (isShareAndEarn) {
      if (commission > 0) {
        userPayout = parseFloat((commission * 0.40).toFixed(2));
      } else if (saleAmount > 0) {
        userPayout = parseFloat((saleAmount * 0.02).toFixed(2)); // 40% of 5% sale amount
      } else {
        userPayout = 10.00;
      }
    } else {
      if (commission > 0) {
        userPayout = parseFloat((commission * 0.60).toFixed(2));
      } else if (saleAmount > 0) {
        userPayout = parseFloat((saleAmount * 0.03).toFixed(2)); // 60% of 5% sale amount
      } else {
        userPayout = 10.00;
      }
    }

    await client.query('BEGIN');

    // Helper to process one-time First-Order Referral bonus
    // User Directive: Even if commission is under ₹50, users MUST receive their promised bonuses!
    // App takes ₹0 margin in this situation to protect user trust 100%.
    const awardFirstOrderBonuses = async (wasFirstOrder) => {
      if (isShareAndEarn || !wasFirstOrder) return false;

      const userBRes = await client.query(
        'SELECT id, name, referred_by FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (userBRes.rowCount === 0) return false;

      const userB = userBRes.rows[0];
      const referrerId = userB.referred_by || click.referrer_id;

      // Mark has_shopped = TRUE on 1st completed order so bonuses trigger strictly once
      await client.query(
        'UPDATE users SET has_shopped = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [userB.id]
      );

      if (referrerId && referrerId.trim()) {
        const userARes = await client.query(
          'SELECT id, name FROM users WHERE id = $1 OR UPPER(referral_code) = UPPER($1) LIMIT 1',
          [referrerId.trim()]
        );
        if (userARes.rowCount > 0) {
          const userA = userARes.rows[0];
          const REFERRER_BONUS = 20.00; // Paid from Platform's 40% Margin
          const REFEREE_BONUS = 10.00;  // Paid from Platform's 40% Margin

          // 1. Credit User A (Referrer) ₹20
          await client.query(
            `UPDATE users
             SET wallet_balance = wallet_balance + $1,
                 referral_earnings = referral_earnings + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [REFERRER_BONUS, userA.id]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'REFERRAL', 'CONFIRMED', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userA.id,
              REFERRER_BONUS,
              `Referral Bonus: Friend (${userB.name || 'Friend'}) completed 1st qualifying shopping order of ₹${saleAmount.toFixed(0)} (+₹20)`,
            ]
          );

          // 2. Credit User B (Referee) ₹10 Welcome Bonus
          await client.query(
            `UPDATE users
             SET wallet_balance = wallet_balance + $1,
                 referral_earnings = referral_earnings + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [REFEREE_BONUS, userB.id]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'REFERRAL', 'CONFIRMED', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userB.id,
              REFEREE_BONUS,
              `Welcome Bonus: 1st qualifying shopping order of ₹${saleAmount.toFixed(0)} completed (+₹10)`,
            ]
          );
        }
      }
      return true;
    };

    // Check if order already recorded
    const existingOrderRes = await client.query(
      'SELECT id, status, cashback_amount FROM cashback_orders WHERE id = $1',
      [orderId]
    );

    if (existingOrderRes.rowCount > 0) {
      const existing = existingOrderRes.rows[0];
      const previousStatus = existing.status;
      const prevCashback = parseFloat(existing.cashback_amount) || 0.0;

      if (previousStatus !== orderStatus) {
        // Handle status progression
        if (previousStatus === 'PENDING' && orderStatus === 'CONFIRMED') {
          if (isShareAndEarn) {
            // Share & Earn: Move pending to confirmed affiliate earnings
            await client.query(
              `UPDATE users
               SET pending_cashback = GREATEST(0.00, pending_cashback - $1),
                   affiliate_earnings = affiliate_earnings + $1,
                   wallet_balance = wallet_balance + $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [prevCashback, userId]
            );

            await client.query(
              `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
               VALUES ($1, $2, $3, 'AFFILIATE', 'CONFIRMED', $4)`,
              [
                `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                userId,
                prevCashback,
                `Affiliate Commission (Share & Earn): Confirmed for order at ${storeName} (Order #${orderId})`,
              ]
            );
          } else {
            // Normal Shopping: Move pending to confirmed cashback
            const userStatusRes = await client.query('SELECT has_shopped FROM users WHERE id = $1', [userId]);
            const wasFirstOrder = userStatusRes.rowCount > 0 && !userStatusRes.rows[0].has_shopped;

            await client.query(
              `UPDATE users
               SET pending_cashback = GREATEST(0.00, pending_cashback - $1),
                   confirmed_cashback = confirmed_cashback + $1,
                   wallet_balance = wallet_balance + $1,
                   coins = coins + $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [prevCashback, Math.round(prevCashback), userId]
            );

            await client.query(
              `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
              VALUES ($1, $2, $3, 'CASHBACK_CONFIRMED', 'CONFIRMED', $4)`,
              [
                `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                userId,
                prevCashback,
                `Cashback confirmed for shopping at ${storeName} (Order #${orderId})`,
              ]
            );

            // Award one-time first-order bonus if qualifying criteria met
            const awarded = await awardFirstOrderBonuses(wasFirstOrder);
            if (!awarded && wasFirstOrder) {
              const uCheck = await client.query('SELECT referred_by FROM users WHERE id = $1', [userId]);
              if (uCheck.rowCount > 0 && !uCheck.rows[0].referred_by) {
                await client.query('UPDATE users SET has_shopped = TRUE WHERE id = $1', [userId]);
              }
            }
          }
        } else if (previousStatus === 'PENDING' && orderStatus === 'REJECTED') {
          // Remove from pending
          await client.query(
            `UPDATE users
             SET pending_cashback = GREATEST(0.00, pending_cashback - $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [prevCashback, userId]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'CASHBACK_REJECTED', 'REJECTED', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userId,
              prevCashback,
              `Cashback rejected for order at ${storeName} (Order #${orderId})`,
            ]
          );
        }

        // Update the order record
        await client.query(
          `UPDATE cashback_orders
           SET status = $1,
               raw_postback = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [orderStatus, JSON.stringify(data), orderId]
        );
      }
    } else {
      // Create new cashback order
      await client.query(
        `INSERT INTO cashback_orders
           (id, user_id, click_id, store_name, order_amount, commission_amount, cashback_amount, status, network, raw_postback)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          orderId,
          userId,
          click.id,
          storeName,
          saleAmount,
          commission,
          userPayout,
          orderStatus,
          network,
          JSON.stringify(data),
        ]
      );

      // Mark the click as converted
      await client.query('UPDATE clicks SET status = $1 WHERE id = $2', ['CONVERTED', click.id]);

      // Credit user's wallet
      if (orderStatus === 'PENDING') {
        if (isShareAndEarn) {
          await client.query(
            `UPDATE users
             SET pending_cashback = pending_cashback + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [userPayout, userId]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'AFFILIATE', 'PENDING', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userId,
              userPayout,
              `Affiliate Commission Tracked (Pending) for order at ${storeName} via your shared link (+₹${userPayout})`,
            ]
          );
        } else {
          await client.query(
            `UPDATE users
             SET pending_cashback = pending_cashback + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [userPayout, userId]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'CASHBACK_PENDING', 'PENDING', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userId,
              userPayout,
              `Cashback tracked (Pending) for order at ${storeName} (Order #${orderId})`,
            ]
          );
        }
      } else if (orderStatus === 'CONFIRMED') {
        if (isShareAndEarn) {
          await client.query(
            `UPDATE users
             SET affiliate_earnings = affiliate_earnings + $1,
                 wallet_balance = wallet_balance + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [userPayout, userId]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'AFFILIATE', 'CONFIRMED', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userId,
              userPayout,
              `Affiliate Commission (Share & Earn): Friend purchased at ${storeName} via your shared link (+₹${userPayout})`,
            ]
          );
        } else {
          const userStatusRes = await client.query('SELECT has_shopped FROM users WHERE id = $1', [userId]);
          const wasFirstOrder = userStatusRes.rowCount > 0 && !userStatusRes.rows[0].has_shopped;

          await client.query(
            `UPDATE users
             SET confirmed_cashback = confirmed_cashback + $1,
                 wallet_balance = wallet_balance + $1,
                 coins = coins + $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [userPayout, Math.round(userPayout), userId]
          );

          await client.query(
            `INSERT INTO wallet_transactions (id, user_id, amount, type, status, description)
             VALUES ($1, $2, $3, 'CASHBACK_CONFIRMED', 'CONFIRMED', $4)`,
            [
              `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              userId,
              userPayout,
              `Instant cashback credited for shopping at ${storeName} (Order #${orderId})`,
            ]
          );

          // Award one-time first-order bonus if qualifying criteria met
          const awarded = await awardFirstOrderBonuses(wasFirstOrder);
          if (!awarded && wasFirstOrder) {
            const uCheck = await client.query('SELECT referred_by FROM users WHERE id = $1', [userId]);
            if (uCheck.rowCount > 0 && !uCheck.rows[0].referred_by) {
              await client.query('UPDATE users SET has_shopped = TRUE WHERE id = $1', [userId]);
            }
          }
        }
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Postback processed successfully.',
      orderId,
      userId,
      storeName,
      status: orderStatus,
      cashbackAmount: userPayout,
      isShareAndEarn,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error handling postback webhook:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to process postback.',
      error: err.message,
    });
  } finally {
    client.release();
  }
};
