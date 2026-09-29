const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const homeRoutes = require('./routes/homeRoutes');
const searchRoutes = require('./routes/searchRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const affiliateRoutes = require('./routes/affiliateRoutes');
const path = require('path');
const postbackRoutes = require('./routes/postbackRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Hybrid Web Landing Page for 'Share & Earn' deals (accessible via /deal or /api/deal)
app.get(['/deal', '/api/deal'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/deal.html'));
});

// Request logging (development)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Cashback & Rewards Backend',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/postbacks', postbackRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.',
    error: err.message,
  });
});

module.exports = app;
