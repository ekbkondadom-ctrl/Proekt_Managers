const express = require('express');
const cors = require('cors');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { loadJSON, saveJSON, FILES, initDatabase, isSetupCompleted, setSetupCompleted, hasSuperAdmin } = require('./storage');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

initDatabase();

const hashPassword = (pwd) => bcryptjs.hashSync(pwd, 10);
const verifyPassword = (pwd, hash) => bcryptjs.compareSync(pwd, hash);
const generateToken = (user) => jwt.sign({ userId: user.id, role: user.role, adminId: user.admin_id }, JWT_SECRET, { expiresIn: '24h' });
const verifyToken = (token) => { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } };

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, error: 'Invalid token' });
  req.user = payload;
  next();
};

// Health
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Status
app.get('/api/system/status', (req, res) => {
  res.json({
    success: true,
    setupCompleted: isSetupCompleted(),
    hasSuperAdmin: hasSuperAdmin()
  });
});

// Setup
app.post('/api/system/setup', (req, res) => {
  if (isSetupCompleted() || hasSuperAdmin()) return res.status(403).json({ success: false, error: 'Setup completed' });
  
  const { name, login, email, password } = req.body;
  if (!name || !login || !email || !password) return res.status(400).json({ success: false, error: 'Missing fields' });
  
  const users = loadJSON(FILES.users, []);
  if (users.some(u => u.login === login)) return res.status(400).json({ success: false, error: 'Login exists' });
  
  const userId = uuid();
  const user = {
    id: userId,
    name, login, email,
    password_hash: hashPassword(password),
    role: 'super_admin',
    status: 'active',
    admin_id: null,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  users.push(user);
  saveJSON(FILES.users, users);
  setSetupCompleted(true);
  
  const token = generateToken(user);
  res.status(201).json({ success: true, token, user: { id, name, login, email, role: 'super_admin' } });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ success: false, error: 'Invalid credentials' });
  
  const users = loadJSON(FILES.users, []);
  const user = users.find(u => u.login === login && u.status === 'active');
  
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  
  user.last_login_at = Date.now();
  users[users.findIndex(u => u.id === user.id)] = user;
  saveJSON(FILES.users, users);
  
  const token = generateToken(user);
  res.json({ success: true, token, user: { id: user.id, name: user.name, login: user.login, email: user.email, role: user.role } });
});

// Check auth
app.get('/api/auth/check', authMiddleware, (req, res) => {
  const users = loadJSON(FILES.users, []);
  const user = users.find(u => u.id === req.user.userId);
  if (!user) return res.status(401).json({ success: false, error: 'User not found' });
  res.json({ success: true, user: { id: user.id, name: user.name, login: user.login, email: user.email, role: user.role } });
});

// Logout
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ success: true });
});

// List users
app.get('/api/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Access denied' });
  
  const users = loadJSON(FILES.users, []);
  const sanitized = users.map(u => ({ id: u.id, name: u.name, login: u.login, email: u.email, role: u.role, status: u.status }));
  res.json({ success: true, users: sanitized });
});

// Create user
app.post('/api/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ success: false, error: 'Access denied' });
  
  const { name, login, email, password, role, adminId } = req.body;
  if (!name || !login || !email || !password || !role) return res.status(400).json({ success: false, error: 'Missing fields' });
  
  const users = loadJSON(FILES.users, []);
  if (users.some(u => u.login === login)) return res.status(400).json({ success: false, error: 'Login exists' });
  
  const userId = uuid();
  const user = {
    id: userId,
    name, login, email,
    password_hash: hashPassword(password),
    role, status: 'active',
    admin_id: adminId || null,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  users.push(user);
  saveJSON(FILES.users, users);
  
  res.status(201).json({ success: true, user: { id: user.id, name, login, email, role } });
});

// Create project
app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, code, client, date } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name required' });
  
  const ownerAdminId = req.user.role === 'manager' ? req.user.adminId : req.user.userId;
  const projectId = uuid();
  const project = {
    id: projectId,
    owner_admin_id: ownerAdminId,
    name, code, client, date,
    images: [], planImages: [], specs: [], configData: [],
    selections: {}, multiSel: {},
    created_at: Date.now(),
    updated_at: Date.now()
  };
  
  const projects = loadJSON(FILES.projects, []);
  projects.push(project);
  saveJSON(FILES.projects, projects);
  
  res.status(201).json({ success: true, project });
});

// List projects
app.get('/api/projects', authMiddleware, (req, res) => {
  let projects = loadJSON(FILES.projects, []);
  
  if (req.user.role === 'admin') {
    projects = projects.filter(p => p.owner_admin_id === req.user.userId);
  } else if (req.user.role === 'manager') {
    projects = projects.filter(p => p.owner_admin_id === req.user.adminId);
  }
  
  res.json({ success: true, projects });
});

// 404
app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/system/status');
  console.log('  POST /api/system/setup');
  console.log('  POST /api/auth/login');
  console.log('  GET  /api/auth/check');
  console.log('  POST /api/auth/logout');
  console.log('  GET  /api/users');
  console.log('  POST /api/users');
  console.log('  POST /api/projects');
  console.log('  GET  /api/projects\n');
});

process.on('SIGINT', () => {
  console.log('\n✓ Server stopped');
  process.exit(0);
});
