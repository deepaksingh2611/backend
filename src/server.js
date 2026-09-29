const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const initDatabase = require('./config/initDb');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Initialize PostgreSQL database and users table
    await initDatabase();
    console.log('PostgreSQL database connection verified.');
  } catch (error) {
    console.warn('Warning: Database initialization encountered an error:', error.message);
    console.warn('Server will still start, but database operations may fail until DB configuration is set in .env.');
  }

  // 2. Start HTTP server
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  Backend Server is running on port: ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Auth API:     http://localhost:${PORT}/api/auth`);
    console.log(`  Users API:    http://localhost:${PORT}/api/users`);
    console.log(`====================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use! Another instance is already running.`);
      console.error(`Stop the running server with Ctrl+C in your other terminal, or choose another PORT.\n`);
    } else {
      console.error('[ERROR] Server failed to start:', err);
    }
    process.exit(1);
  });
}

startServer();
