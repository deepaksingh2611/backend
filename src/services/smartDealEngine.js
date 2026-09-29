/**
 * Smart Deal Engine
 * 
 * Provides automated, background computation for:
 * 1. Smart Price Comparison (multi-store pricing evaluation)
 * 2. Smart Coupon Optimizer (auto-identifying optimal coupons per store and order value)
 * 3. Smart Savings Engine (stacking store discount + coupon + bank offer + cashback)
 * 4. Automatic Best Deal Sorting (ranks products so the highest net savings appear first)
 */

// Cashback KashIQ pays the user, by merchant store. This is separate from the
// brand/store offer (e.g. "50% OFF") shown on product and store cards.
// Keys are normalised store names (lower-case letters and digits only).
const STORE_CASHBACK_RATES = {
  myntra: 10.0,
  ajio: 12.0,
  amazon: 7.0,
  flipkart: 6.0,
  nykaa: 10.0,
  croma: 5.0,
  reliancedigital: 6.0,
  tatacliq: 8.0,
  puma: 9.0,
  hm: 8.0,
  meesho: 6.0,
  dyson: 6.0,
  samsung: 5.0,
  apple: 4.0,
};

const normaliseStoreKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');

// Available coupons inventory per store
const COUPON_INVENTORY = [
  // Myntra
  { store: 'Myntra', code: 'MYNTRA500', minOrder: 2499, type: 'FLAT', value: 500, maxDiscount: 500, desc: '₹500 OFF on orders above ₹2,499' },
  { store: 'Myntra', code: 'MYNTRA20', minOrder: 3999, type: 'PERCENT', value: 20, maxDiscount: 1200, desc: '20% OFF up to ₹1,200 on fashion' },
  { store: 'Myntra', code: 'NIKE500', minOrder: 4999, type: 'FLAT', value: 500, maxDiscount: 500, desc: '₹500 OFF on Nike products' },
  { store: 'Myntra', code: 'LEVI300', minOrder: 1500, type: 'FLAT', value: 300, maxDiscount: 300, desc: '₹300 OFF on Levi\'s apparel' },

  // Amazon
  { store: 'Amazon', code: 'AMZTECH250', minOrder: 1500, type: 'FLAT', value: 250, maxDiscount: 250, desc: '₹250 OFF on electronics & audio' },
  { store: 'Amazon', code: 'AUDIO1500', minOrder: 20000, type: 'FLAT', value: 1500, maxDiscount: 1500, desc: '₹1,500 OFF on premium headphones' },
  { store: 'Amazon', code: 'SONY1500', minOrder: 20000, type: 'FLAT', value: 1500, maxDiscount: 1500, desc: '₹1,500 OFF on Sony audio gear' },
  { store: 'Amazon', code: 'AMZSUPER10', minOrder: 3000, type: 'PERCENT', value: 10, maxDiscount: 800, desc: '10% OFF up to ₹800 on Amazon' },

  // Flipkart
  { store: 'Flipkart', code: 'FLIPKART400', minOrder: 2999, type: 'FLAT', value: 400, maxDiscount: 400, desc: '₹400 OFF on orders above ₹2,999' },
  { store: 'Flipkart', code: 'IPHONE2000', minOrder: 50000, type: 'FLAT', value: 2000, maxDiscount: 2000, desc: '₹2,000 instant voucher on iPhone 15' },
  { store: 'Flipkart', code: 'FKFEST10', minOrder: 4000, type: 'PERCENT', value: 10, maxDiscount: 1000, desc: '10% OFF up to ₹1,000 on gadgets' },

  // AJIO
  { store: 'AJIO', code: 'AJIOMAN10', minOrder: 1999, type: 'PERCENT', value: 10, maxDiscount: 600, desc: '10% OFF on menswear' },
  { store: 'AJIO', code: 'AJIOBIG300', minOrder: 2499, type: 'FLAT', value: 300, maxDiscount: 300, desc: '₹300 OFF on orders above ₹2,499' },
  { store: 'AJIO', code: 'AJIOMAX500', minOrder: 3499, type: 'FLAT', value: 500, maxDiscount: 500, desc: '₹500 OFF on orders above ₹3,499' },

  // Nykaa
  { store: 'Nykaa', code: 'NYKAAFLAT300', minOrder: 2000, type: 'FLAT', value: 300, maxDiscount: 300, desc: '₹300 OFF on luxury beauty' },
  { store: 'Nykaa', code: 'GLOW15', minOrder: 1500, type: 'PERCENT', value: 15, maxDiscount: 500, desc: '15% OFF up to ₹500 on skincare' },

  // Croma
  { store: 'Croma', code: 'CROMA1000', minOrder: 15000, type: 'FLAT', value: 1000, maxDiscount: 1000, desc: '₹1,000 OFF on appliances & audio' },
  { store: 'Croma', code: 'CROMATECH500', minOrder: 8000, type: 'FLAT', value: 500, maxDiscount: 500, desc: '₹500 OFF on smart electronics' },

  // Dyson
  { store: 'Dyson', code: 'DYSONFEST', minOrder: 25000, type: 'FLAT', value: 2000, maxDiscount: 2000, desc: '₹2,000 instant festival discount' },
];

/**
 * Resolves cashback rate for a store
 */
function getStoreCashbackRate(storeName, category = '') {
  if (!storeName) return 5.0;
  // Normalised so "Tata CLiQ" matches tatacliq, "H&M" matches hm, etc.
  return STORE_CASHBACK_RATES[normaliseStoreKey(storeName)] || 5.0;
}

/**
 * 1. Smart Coupon Optimizer
 * Automatically evaluates all active coupons for the store and order amount,
 * selecting the coupon that maximizes the user's discount.
 */
function optimizeStoreCoupon(storeName, orderAmount, category = '') {
  if (!storeName || !orderAmount || orderAmount <= 0) return null;

  const cleanStore = storeName.trim().toLowerCase();
  const validCoupons = COUPON_INVENTORY.filter((cp) => {
    return cp.store.toLowerCase() === cleanStore && orderAmount >= cp.minOrder;
  });

  if (validCoupons.length === 0) return null;

  let bestCoupon = null;
  let maxSavings = 0;

  for (const cp of validCoupons) {
    let discount = 0;
    if (cp.type === 'FLAT') {
      discount = cp.value;
    } else if (cp.type === 'PERCENT') {
      discount = Math.min(cp.maxDiscount || Infinity, Math.round(orderAmount * (cp.value / 100)));
    }

    if (discount > maxSavings) {
      maxSavings = discount;
      bestCoupon = {
        code: cp.code,
        discount: discount,
        description: cp.desc,
      };
    }
  }

  return bestCoupon;
}

/**
 * Bank discount is disabled (0) as KashIQ is a cashback & reward platform,
 * not a checkout payment gateway. We do not assume users hold specific bank cards.
 */
function calculateBankDiscount(amount, storeName) {
  return 0;
}

/**
 * 2. Smart Savings Engine
 * Stacks store discount, auto-optimized coupon, and real cashback
 * to compute the true payable effective price and total savings.
 */
function calculateStackedSavings(storeName, originalPrice, storePrice, category = '') {
  const safeOriginalPrice = Number(originalPrice) || 0;
  const safeStorePrice = Number(storePrice) || safeOriginalPrice;

  const storeDiscount = Math.max(0, safeOriginalPrice - safeStorePrice);

  // 1. Auto-optimize best coupon
  const bestCoupon = optimizeStoreCoupon(storeName, safeStorePrice, category);
  const couponDiscount = bestCoupon ? bestCoupon.discount : 0;
  const couponCode = bestCoupon ? bestCoupon.code : '';

  // 2. Bank discount is 0 (KashIQ is cashback/rewards, not payment gateway)
  const bankDiscount = 0;

  // 3. Real Cashback
  const cashbackPercentage = getStoreCashbackRate(storeName, category);
  const cashbackBasePrice = Math.max(0, safeStorePrice - couponDiscount);
  const cashbackAmount = Math.round(cashbackBasePrice * (cashbackPercentage / 100));

  // 4. Effective final price: Store Price - Coupon - Cashback
  const effectivePrice = Math.max(0, Math.round(safeStorePrice - couponDiscount - cashbackAmount));
  const effectiveSavings = Math.max(0, safeOriginalPrice - effectivePrice);
  const savingsPercentage = safeOriginalPrice > 0 ? Math.round((effectiveSavings / safeOriginalPrice) * 100) : 0;

  return {
    store: storeName,
    price: safeStorePrice,
    storeDiscount,
    couponDiscount,
    couponCode,
    bankDiscount,
    cashbackPercentage,
    cashbackAmount,
    effectivePrice,
    effectiveSavings,
    savingsPercentage,
  };
}

/**
 * 3. Smart Price Comparison
 * Compares multi-store offerings for a product, runs the savings engine across all stores,
 * and automatically flags the lowest effective price store as `isBest: true`.
 */
function compareAndPickBestStore(rawStores, originalPrice, category = '') {
  if (!rawStores || rawStores.length === 0) {
    return { stores: [], bestStore: null };
  }

  const evaluatedStores = rawStores.map((raw) => {
    const storeName = raw.store || raw.name || 'Online Store';
    const storePrice = raw.price || raw.productPrice || originalPrice;
    const computed = calculateStackedSavings(storeName, originalPrice, storePrice, category);

    return {
      store: storeName,
      logoUrl: raw.logoUrl || '',
      price: computed.price,
      storeDiscount: computed.storeDiscount,
      coupon: computed.couponDiscount,
      couponCode: computed.couponCode,
      bankDiscount: computed.bankDiscount,
      cashback: computed.cashbackAmount,
      cashbackPercentage: computed.cashbackPercentage,
      effectivePrice: computed.effectivePrice,
      savings: computed.effectiveSavings,
      shopUrl: raw.shopUrl || raw.websiteUrl || `https://www.${storeName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
      isBest: false,
    };
  });

  // Pick winning store (lowest effectivePrice)
  evaluatedStores.sort((a, b) => a.effectivePrice - b.effectivePrice);
  if (evaluatedStores.length > 0) {
    evaluatedStores[0].isBest = true;
  }

  return {
    stores: evaluatedStores,
    bestStore: evaluatedStores[0] || null,
  };
}

/**
 * Enriches a single product with full smart comparison, coupon optimization, and savings engine data.
 */
function enrichProductWithBestDeal(product) {
  const originalPrice = Number(product.originalPrice) || 0;
  const category = product.category || '';

  // If product already provides multi-store choices, compare them
  if (product.stores && product.stores.length > 0) {
    const { stores, bestStore } = compareAndPickBestStore(product.stores, originalPrice, category);

    const discountPercentage = originalPrice > 0
      ? Math.round(((originalPrice - bestStore.price) / originalPrice) * 100)
      : 0;

    return {
      ...product,
      store: bestStore.store,
      discountedPrice: bestStore.price,
      discountPercentage: discountPercentage,
      effectivePrice: bestStore.effectivePrice,
      effectiveSavings: bestStore.savings,
      savingsPercentage: bestStore.savingsPercentage || Math.round((bestStore.savings / originalPrice) * 100),
      cashbackPercentage: bestStore.cashbackPercentage,
      cashbackAmount: bestStore.cashback,
      couponCode: bestStore.couponCode,
      couponDiscount: bestStore.coupon,
      isBestDeal: true,
      badge: '🏆 Best Deal',
      storesAvailable: stores.map((s) => s.store),
      stores: stores,
    };
  }

  // Single store product: run stacked savings directly
  const singleStore = product.store || 'Amazon';
  const currentPrice = product.discountedPrice || product.price || originalPrice;
  const computed = calculateStackedSavings(singleStore, originalPrice, currentPrice, category);

  const discountPercentage = originalPrice > 0
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;

  return {
    ...product,
    store: singleStore,
    discountedPrice: currentPrice,
    discountPercentage,
    effectivePrice: computed.effectivePrice,
    effectiveSavings: computed.effectiveSavings,
    savingsPercentage: computed.savingsPercentage,
    cashbackPercentage: computed.cashbackPercentage,
    cashbackAmount: computed.cashbackAmount,
    couponCode: computed.couponCode,
    couponDiscount: computed.couponDiscount,
    isBestDeal: true,
    badge: '🏆 Best Deal',
    storesAvailable: [singleStore],
    stores: [
      {
        store: singleStore,
        price: currentPrice,
        storeDiscount: computed.storeDiscount,
        coupon: computed.couponDiscount,
        couponCode: computed.couponCode,
        bankDiscount: computed.bankDiscount,
        cashback: computed.cashbackAmount,
        cashbackPercentage: computed.cashbackPercentage,
        effectivePrice: computed.effectivePrice,
        savings: computed.effectiveSavings,
        isBest: true,
      },
    ],
  };
}

/**
 * 4. Automatic Best Deal Sorting & Ranking
 * Takes any list of products, enriches each through the multi-store comparison,
 * coupon optimizer, and savings engine, and sorts them so that the best deals
 * (highest savings percentage & lowest effective price) appear at the top!
 */
function enrichAndSortBestDeals(products) {
  if (!products || !Array.isArray(products)) return [];

  const enriched = products.map((p) => enrichProductWithBestDeal(p));

  // Sort: Highest savings percentage first; if tied, lowest effectivePrice
  enriched.sort((a, b) => {
    const savingsDiff = (b.savingsPercentage || 0) - (a.savingsPercentage || 0);
    if (savingsDiff !== 0) return savingsDiff;
    return (a.effectivePrice || 0) - (b.effectivePrice || 0);
  });

  return enriched;
}

module.exports = {
  getStoreCashbackRate,
  optimizeStoreCoupon,
  calculateBankDiscount,
  calculateStackedSavings,
  compareAndPickBestStore,
  enrichProductWithBestDeal,
  enrichAndSortBestDeals,
  COUPON_INVENTORY,
  STORE_CASHBACK_RATES,
};
