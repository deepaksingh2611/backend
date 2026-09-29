const crypto = require('crypto');
const pool = require('../config/db');

/**
 * Generates an affiliate tracking URL with unique Sub-ID and logs click event
 * POST /api/affiliate/generate-link
 */
exports.generateLink = async (req, res) => {
  try {
    const { userId, storeName, storeId, targetUrl, network = 'generic', linkType = 'SELF_SHOPPING' } = req.body;

    if (!userId || !storeName || !targetUrl) {
      return res.status(400).json({
        success: false,
        message: 'userId, storeName, and targetUrl are required fields.',
      });
    }

    // Verify that user exists and check for referrer
    const userCheck = await pool.query('SELECT id, name, referral_code, referred_by FROM users WHERE id = $1', [userId.trim()]);
    if (userCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `User with ID "${userId}" not found.`,
      });
    }

    const currentUser = userCheck.rows[0];
    const isShareAndEarn = (linkType || '').toUpperCase() === 'SHARE_AND_EARN';
    // If user is shopping for themselves and was referred by someone, attach referrerId
    const referrerId = isShareAndEarn ? null : (currentUser.referred_by || null);

    // Generate unique clickId / Sub-ID
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const clickId = `clk_${Date.now()}_${randomSuffix}`;
    const subId = clickId;

    // Clean destination URL
    let cleanUrl = targetUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Build network-specific or generic tracked affiliate URL
    let affiliateUrl = cleanUrl;
    const netLower = (network || '').toLowerCase();

    // Additional tracking query params to embed both Buyer ID and Referrer ID if applicable
    const extraParams = `&buyer_id=${encodeURIComponent(userId.trim())}${referrerId ? `&ref_id=${encodeURIComponent(referrerId)}` : ''}&link_type=${isShareAndEarn ? 'SHARE_AND_EARN' : 'SELF_SHOPPING'}`;

    if (netLower === 'cuelinks') {
      const pubId = process.env.CUELINKS_PUB_ID || 'kashiq_pub';
      affiliateUrl = `https://linksredirect.com/?pub_id=${pubId}&subid=${subId}&url=${encodeURIComponent(cleanUrl)}`;
    } else if (netLower === 'vcommission') {
      const affId = process.env.VCOMMISSION_AFF_ID || 'kashiq';
      affiliateUrl = `https://tracking.vcommission.com/aff_c?aff_id=${affId}&aff_sub=${subId}&url=${encodeURIComponent(cleanUrl)}`;
    } else if (process.env.AFFILIATE_REDIRECT_TEMPLATE) {
      affiliateUrl = process.env.AFFILIATE_REDIRECT_TEMPLATE
        .replace('{subid}', subId)
        .replace('{url}', encodeURIComponent(cleanUrl));
    } else {
      // Standard affiliate query parameter attribution fallback
      const separator = cleanUrl.includes('?') ? '&' : '?';
      affiliateUrl = `${cleanUrl}${separator}subid=${subId}&utm_source=kashiq&utm_medium=cashback&utm_campaign=click_track${extraParams}`;
    }

    // Insert click record in database with link_type and referrer_id
    const insertQuery = `
      INSERT INTO clicks (id, user_id, store_name, store_id, target_url, affiliate_url, sub_id, network, link_type, referrer_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CLICKED')
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      clickId,
      userId.trim(),
      storeName.trim(),
      storeId ? storeId.trim() : null,
      cleanUrl,
      affiliateUrl,
      subId,
      network,
      isShareAndEarn ? 'SHARE_AND_EARN' : 'SELF_SHOPPING',
      referrerId,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Tracking link generated successfully.',
      clickId,
      subId,
      affiliateUrl,
      targetUrl: cleanUrl,
      linkType: isShareAndEarn ? 'SHARE_AND_EARN' : 'SELF_SHOPPING',
      referrerId,
      click: result.rows[0],
    });
  } catch (err) {
    console.error('Error generating affiliate tracking link:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate affiliate link.',
      error: err.message,
    });
  }
};

/**
 * Fetches recent clicks / shopping trips for a specific user
 * GET /api/affiliate/clicks/:userId
 */
exports.getUserClicks = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required.',
      });
    }

    const query = `
      SELECT id, store_name, store_id, target_url, affiliate_url, sub_id, status, created_at
      FROM clicks
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50;
    `;

    const result = await pool.query(query, [userId.trim()]);

    return res.status(200).json({
      success: true,
      clicks: result.rows,
    });
  } catch (err) {
    console.error('Error fetching user clicks:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user clicks.',
      error: err.message,
    });
  }
};
