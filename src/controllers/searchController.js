/**
 * Search Controller - Handles Universal Search across products, stores, categories, offers, and coupons
 */
const { enrichAndSortBestDeals, compareAndPickBestStore } = require('../services/smartDealEngine');
const { HOME_DATA } = require('./homeController');

// Master searchable dataset
const PRODUCTS_DB = [
  {
    id: 'prod-1',
    title: 'Nike Air Max 270 React',
    brand: 'Nike',
    category: 'Sports Shoes',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
    availableAt: ['Amazon', 'Myntra', 'Flipkart'],
    bestEffectivePrice: 4650,
    originalPrice: 5999,
    cashbackAmount: 350,
    cashbackPercentage: 10,
    couponText: '₹500 OFF',
    couponDiscount: 500,
    badge: '🏆 Best Deal',
    bestStore: 'Myntra',
    description: 'Nike Air Max 270 offers all-day comfort with the largest Air Max heel unit yet.',
    stores: [
      {
        store: 'Amazon',
        price: 5600,
        storeDiscount: 399,
        cashback: 300,
        coupon: 200,
        effectivePrice: 5100,
        savings: 899,
        isBest: false,
      },
      {
        store: 'Myntra',
        price: 5500,
        storeDiscount: 499,
        cashback: 350,
        coupon: 500,
        effectivePrice: 4650,
        savings: 1349,
        isBest: true,
      },
      {
        store: 'Flipkart',
        price: 5400,
        storeDiscount: 599,
        cashback: 250,
        coupon: 300,
        effectivePrice: 4850,
        savings: 1149,
        isBest: false,
      },
    ],
  },
  {
    id: 'prod-2',
    title: 'Nike Revolution 6 Running Shoes',
    brand: 'Nike',
    category: 'Running Shoes',
    imageUrl: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600',
    availableAt: ['Myntra', 'Amazon', 'AJIO'],
    bestEffectivePrice: 2899,
    originalPrice: 3999,
    cashbackAmount: 250,
    cashbackPercentage: 8,
    couponText: '₹300 OFF',
    couponDiscount: 300,
    badge: '🏆 Best Deal',
    bestStore: 'AJIO',
    description: 'Plush cushioning and breathability made from at least 20% recycled material.',
    stores: [
      {
        store: 'AJIO',
        price: 3299,
        storeDiscount: 700,
        cashback: 250,
        coupon: 300,
        effectivePrice: 2749,
        savings: 1250,
        isBest: true,
      },
      {
        store: 'Myntra',
        price: 3499,
        storeDiscount: 500,
        cashback: 200,
        coupon: 250,
        effectivePrice: 3049,
        savings: 950,
        isBest: false,
      },
      {
        store: 'Amazon',
        price: 3599,
        storeDiscount: 400,
        cashback: 150,
        coupon: 100,
        effectivePrice: 3349,
        savings: 650,
        isBest: false,
      },
    ],
  },
  {
    id: 'prod-3',
    title: 'Nike Air Force 1 07',
    brand: 'Nike',
    category: 'Casual Shoes',
    imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600',
    availableAt: ['Nike India', 'Myntra'],
    bestEffectivePrice: 7495,
    originalPrice: 8495,
    cashbackAmount: 600,
    cashbackPercentage: 8,
    couponText: '₹400 OFF',
    couponDiscount: 400,
    badge: '🏆 Best Deal',
    bestStore: 'Myntra',
    description: 'The radiance lives on in the Nike Air Force 1 07, the basketball icon.',
    stores: [
      {
        store: 'Myntra',
        price: 7995,
        storeDiscount: 500,
        cashback: 600,
        coupon: 400,
        effectivePrice: 6995,
        savings: 1500,
        isBest: true,
      },
      {
        store: 'Nike India',
        price: 8495,
        storeDiscount: 0,
        cashback: 400,
        coupon: 0,
        effectivePrice: 8095,
        savings: 400,
        isBest: false,
      },
    ],
  },
  {
    id: 'prod-4',
    title: 'Apple iPhone 15 (128 GB)',
    brand: 'Apple',
    category: 'Smartphones',
    imageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600',
    availableAt: ['Amazon', 'Flipkart', 'Croma'],
    bestEffectivePrice: 66999,
    originalPrice: 79900,
    cashbackAmount: 2500,
    cashbackPercentage: 4,
    couponText: '₹2,000 Bank OFF',
    couponDiscount: 2000,
    badge: '🏆 Best Deal',
    bestStore: 'Flipkart',
    description: 'Dynamic Island, 48MP Main camera, and USB-C in an industry-leading glass design.',
    stores: [
      {
        store: 'Flipkart',
        price: 70999,
        storeDiscount: 8901,
        cashback: 2500,
        coupon: 2000,
        effectivePrice: 66499,
        savings: 13401,
        isBest: true,
      },
      {
        store: 'Amazon',
        price: 71999,
        storeDiscount: 7901,
        cashback: 2000,
        coupon: 1500,
        effectivePrice: 68499,
        savings: 11401,
        isBest: false,
      },
    ],
  },
  {
    id: 'prod-5',
    title: 'Sony WH-1000XM5 ANC Headphones',
    brand: 'Sony',
    category: 'Electronics',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
    availableAt: ['Amazon', 'Croma', 'Flipkart'],
    bestEffectivePrice: 21690,
    originalPrice: 29990,
    cashbackAmount: 1800,
    cashbackPercentage: 7,
    couponText: '₹1,500 OFF',
    couponDiscount: 1500,
    badge: '🏆 Best Deal',
    bestStore: 'Amazon',
    description: 'Industry-leading noise cancellation with two processors and 8 microphones.',
    stores: [
      {
        store: 'Amazon',
        price: 24990,
        storeDiscount: 5000,
        cashback: 1800,
        coupon: 1500,
        effectivePrice: 21690,
        savings: 8300,
        isBest: true,
      },
    ],
  },
];

const STORES_DB = [
  {
    id: 'st-nike',
    name: 'Nike',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg',
    cashbackRate: 'Up to 10%',
    availableOffers: '18+',
    availableCoupons: '8',
    websiteUrl: 'https://www.nike.com/in',
    category: 'Sports & Footwear',
  },
  {
    id: 'st-myntra',
    name: 'Myntra',
    logoUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-myntra-logo-icon-download-in-svg-png-gif-file-formats--shopping-brand-social-media-pack-logos-icons-4258814.png',
    cashbackRate: 'Up to 12%',
    availableOffers: '25+',
    availableCoupons: '12',
    websiteUrl: 'https://www.myntra.com',
    category: 'Fashion & Lifestyle',
  },
  {
    id: 'st-ajio',
    name: 'AJIO',
    logoUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-ajio-logo-icon-download-in-svg-png-gif-file-formats--social-media-pack-logos-icons-4258810.png',
    cashbackRate: 'Up to 10%',
    availableOffers: '20+',
    availableCoupons: '9',
    websiteUrl: 'https://www.ajio.com',
    category: 'Fashion & Trends',
  },
  {
    id: 'st-amazon',
    name: 'Amazon',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Amazon_icon.svg',
    cashbackRate: 'Up to 8%',
    availableOffers: '50+',
    availableCoupons: '30',
    websiteUrl: 'https://www.amazon.in',
    category: 'All Retail',
  },
  {
    id: 'st-flipkart',
    name: 'Flipkart',
    logoUrl: 'https://cdn.iconscout.com/icon/free/png-256/free-flipkart-logo-icon-download-in-svg-png-gif-file-formats--shopping-brand-social-media-pack-logos-icons-4258813.png',
    cashbackRate: 'Up to 6%',
    availableOffers: '40+',
    availableCoupons: '25',
    websiteUrl: 'https://www.flipkart.com',
    category: 'Electronics & Lifestyle',
  },
];

const CATEGORIES_DB = [
  { id: 'cat-1', name: 'Sports Shoes', icon: 'directions_run', queryKeyword: 'shoes' },
  { id: 'cat-2', name: 'Men\'s Shoes', icon: 'man', queryKeyword: 'shoes' },
  { id: 'cat-3', name: 'Running Shoes', icon: 'fitness_center', queryKeyword: 'shoes' },
  { id: 'cat-4', name: 'Casual Shoes', icon: 'ice_skating', queryKeyword: 'shoes' },
  { id: 'cat-5', name: 'Smartphones', icon: 'smartphone', queryKeyword: 'smartphones' },
  { id: 'cat-6', name: 'Fashion', icon: 'checkroom', queryKeyword: 'fashion' },
  { id: 'cat-7', name: 'Electronics', icon: 'devices', queryKeyword: 'electronics' },
  { id: 'cat-8', name: 'Laptops', icon: 'laptop', queryKeyword: 'laptops' },
];

const OFFERS_DB = [
  {
    id: 'off-nike-1',
    store: 'Nike',
    title: 'Nike — Up to 40% OFF End of Season Sale',
    discount: 'Up to 40% OFF',
    cashback: 'Extra 10% Cashback',
    expiry: 'Valid till 30 Sep',
    category: 'Sports',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
    ctaText: 'Shop Now',
  },
  {
    id: 'off-myntra-1',
    store: 'Myntra',
    title: 'Nike & Footwear Mania — Extra 20% OFF',
    discount: 'Extra 20% OFF',
    cashback: '12% Cashback',
    expiry: 'Ends in 2 days',
    category: 'Fashion',
    imageUrl: 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=600',
    ctaText: 'Shop Now',
  },
  {
    id: 'off-ajio-1',
    store: 'AJIO',
    title: 'Sneakers Fest — Up to 50% OFF on Top Footwear',
    discount: 'Up to 50% OFF',
    cashback: '10% Cashback',
    expiry: 'Limited Time',
    category: 'Fashion',
    imageUrl: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600',
    ctaText: 'Shop Now',
  },
  {
    id: 'off-amazon-1',
    store: 'Amazon',
    title: 'Amazon Tech Clearance — Flat ₹500 OFF + 8% Cashback',
    discount: 'Extra ₹500 OFF',
    cashback: '8% Cashback',
    expiry: 'Valid today only',
    category: 'Electronics',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
    ctaText: 'Shop Now',
  },
];

const COUPONS_DB = [
  {
    id: 'cp-nike-1',
    code: 'NIKE500',
    store: 'Nike',
    discount: '₹500 OFF',
    minOrder: 2999,
    cashback: 'Up to 10%',
    validity: 'Valid till 30 Sep',
    description: 'Flat ₹500 instant discount on orders above ₹2,999 on Nike Official',
  },
  {
    id: 'cp-nike-2',
    code: 'NIKE10',
    store: 'Nike',
    discount: '10% OFF',
    minOrder: 1999,
    cashback: 'Up to 10%',
    validity: 'Valid till 15 Oct',
    description: '10% instant discount on newly arrived sports gear and sneakers',
  },
  {
    id: 'cp-myntra-1',
    code: 'MYNTRA500',
    store: 'Myntra',
    discount: '₹500 OFF',
    minOrder: 2499,
    cashback: 'Up to 12%',
    validity: 'Valid till 28 Sep',
    description: 'Applicable on orders above ₹2,499 across all footwear and apparel',
  },
  {
    id: 'cp-ajio-1',
    code: 'AJIO15',
    store: 'AJIO',
    discount: '15% OFF',
    minOrder: 2499,
    cashback: 'Up to 10%',
    validity: 'Valid this weekend',
    description: 'Flat 15% discount on top international apparel and sneakers',
  },
];

/**
 * GET /api/search?q=...&type=all|products|stores|categories|offers|coupons
 */
async function universalSearch(req, res) {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const type = (req.query.type || 'all').trim().toLowerCase();

    if (!q) {
      return res.status(200).json({
        success: true,
        query: '',
        type,
        data: {
          products: [],
          stores: [],
          categories: [],
          offers: [],
          coupons: [],
        },
      });
    }

    // Filter Products & automatically sort by Best Deals
    const matchedProducts = PRODUCTS_DB.filter((p) => {
      return (
        p.title.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.availableAt && p.availableAt.some((s) => s.toLowerCase().includes(q)))
      );
    });
    const products = enrichAndSortBestDeals(matchedProducts);

    // Filter Stores
    const stores = STORES_DB.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });

    // Filter Categories
    const categories = CATEGORIES_DB.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.queryKeyword.toLowerCase().includes(q) ||
        q.includes(c.queryKeyword.toLowerCase())
      );
    });

    // Filter Offers
    const offers = OFFERS_DB.filter((o) => {
      return (
        o.title.toLowerCase().includes(q) ||
        o.store.toLowerCase().includes(q) ||
        o.discount.toLowerCase().includes(q) ||
        o.category.toLowerCase().includes(q)
      );
    });

    // Filter Coupons
    const coupons = COUPONS_DB.filter((c) => {
      return (
        c.store.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.discount.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });

    // Filter by requested type if specific
    const responseData = {
      products: type === 'all' || type === 'products' ? products : [],
      stores: type === 'all' || type === 'stores' ? stores : [],
      categories: type === 'all' || type === 'categories' ? categories : [],
      offers: type === 'all' || type === 'offers' ? offers : [],
      coupons: type === 'all' || type === 'coupons' ? coupons : [],
    };

    return res.status(200).json({
      success: true,
      query: q,
      type,
      totalMatches:
        responseData.products.length +
        responseData.stores.length +
        responseData.categories.length +
        responseData.offers.length +
        responseData.coupons.length,
      data: responseData,
    });
  } catch (error) {
    console.error('Error in universalSearch:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute search.',
      error: error.message,
    });
  }
}

/**
 * GET /api/search/comparison/:id
 * Fetches store comparison and Smart Savings breakdown for a specific product
 */
async function getProductComparison(req, res) {
  try {
    const { id } = req.params;
    const product = PRODUCTS_DB.find((p) => p.id === id) || PRODUCTS_DB[0];
    const { stores, bestStore } = compareAndPickBestStore(
      product.stores || [],
      product.originalPrice,
      product.category
    );

    return res.status(200).json({
      success: true,
      data: {
        productId: product.id,
        title: product.title,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        description: product.description,
        bestStore: bestStore ? bestStore.store : (product.bestStore || 'Myntra'),
        bestEffectivePrice: bestStore ? bestStore.effectivePrice : product.bestEffectivePrice,
        stores: stores,
      },
    });
  } catch (error) {
    console.error('Error in getProductComparison:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product comparison.',
      error: error.message,
    });
  }
}

module.exports = {
  universalSearch,
  getProductComparison,
  PRODUCTS_DB,
  STORES_DB,
  CATEGORIES_DB,
  OFFERS_DB,
  COUPONS_DB,
};
