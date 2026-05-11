/**
 * Simple JSON-based storage for development
 * Easy to migrate to real database later
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  projects: path.join(DATA_DIR, 'projects.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  config: path.join(DATA_DIR, 'config.json')
};

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load JSON file
function loadJSON(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Save JSON file
function saveJSON(filePath, data) {
  try {
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// Initialize storage
function initDatabase() {
  ensureDataDir();
  
  // Create empty files if they don't exist
  if (!fs.existsSync(FILES.users)) {
    saveJSON(FILES.users, []);
  }
  if (!fs.existsSync(FILES.projects)) {
    saveJSON(FILES.projects, []);
  }
  if (!fs.existsSync(FILES.settings)) {
    saveJSON(FILES.settings, []);
  }
  if (!fs.existsSync(FILES.logs)) {
    saveJSON(FILES.logs, []);
  }
  if (!fs.existsSync(FILES.config)) {
    saveJSON(FILES.config, {
      initial_setup_completed: false,
      created_at: Date.now()
    });
  }
  
  console.log(`✓ Data storage initialized at: ${DATA_DIR}`);
  
  return {
    db: true,
    close: () => {}
  };
}

function isSetupCompleted() {
  const config = loadJSON(FILES.config, {});
  return config.initial_setup_completed === true;
}

function setSetupCompleted(completed = true) {
  const config = loadJSON(FILES.config, {});
  config.initial_setup_completed = completed;
  saveJSON(FILES.config, config);
}

function hasSuperAdmin() {
  const users = loadJSON(FILES.users, []);
  return users.some(u => u.role === 'super_admin' && u.status === 'active');
}

function isDatabaseInitialized() {
  return fs.existsSync(DATA_DIR);
}

function resetDatabase() {
  try {
    if (fs.existsSync(DATA_DIR)) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      console.log(`✓ Data storage reset`);
    }
  } catch (err) {
    console.error('Reset error:', err.message);
  }
}

module.exports = {
  DATA_DIR,
  FILES,
  loadJSON,
  saveJSON,
  initDatabase,
  isSetupCompleted,
  setSetupCompleted,
  hasSuperAdmin,
  isDatabaseInitialized,
  resetDatabase
};
