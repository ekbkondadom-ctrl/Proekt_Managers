require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db/init');
const { authMiddleware, optionalAuthMiddleware } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const systemRoutes = require('./routes/system');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*';

async function startServer() {
  const db = await initDatabase();

  app.use(cors({ origin: CORS_ORIGIN }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(path.join(__dirname, '..')));

  app.use((req, res, next) => {
    req.db = db;
    req.ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown';
    next();
  });

  app.use(optionalAuthMiddleware);

  app.use('/api/system', systemRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/settings', settingsRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on http://0.0.0.0:${PORT}`);
    console.log(`✓ Using SQLite DB: ${process.env.DATABASE_PATH || './conda.db'}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n✓ Server stopped');
  process.exit(0);
});
