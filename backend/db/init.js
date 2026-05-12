/**
 * db/init.js
 * 
 * Инициализация SQLite базы данных для backend сервера
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const initSqlJs = require('sql.js');

dotenv.config();

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../conda.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function ensureDatabaseDir() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

function saveDatabase(db) {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('Database save error:', err.message);
    throw err;
  }
}

function createStatementWrapper(db, statement) {
  return {
    run: (...params) => {
      if (params.length) {
        statement.bind(params);
      }
      statement.step();
      statement.free();
      saveDatabase(db);
      return { changes: db.getRowsModified() };
    },
    get: (...params) => {
      if (params.length) {
        statement.bind(params);
      }
      const hasRow = statement.step();
      const row = hasRow ? statement.getAsObject() : null;
      statement.free();
      return row;
    },
    all: (...params) => {
      if (params.length) {
        statement.bind(params);
      }
      const rows = [];
      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
      statement.free();
      return rows;
    }
  };
}

async function initDatabase() {
  try {
    ensureDatabaseDir();

    const SQL = await initSqlJs({ locateFile: file => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file) });
    let db;

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    db.exec('PRAGMA foreign_keys = ON;');

    if (!fs.existsSync(SCHEMA_FILE)) {
      throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
    }

    const schema = fs.readFileSync(SCHEMA_FILE, 'utf-8');
    db.exec(schema);

    // Migrations for existing databases
    try { db.exec('ALTER TABLE users ADD COLUMN permissions TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN email TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN plain_password TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN allowed_project_ids TEXT'); } catch(e) {}

    saveDatabase(db);

    const wrappedDb = {
      prepare: sql => createStatementWrapper(db, db.prepare(sql)),
      exec: sql => {
        const result = db.exec(sql);
        saveDatabase(db);
        return result;
      },
      pragma: sql => db.exec(`PRAGMA ${sql}`),
      close: () => db.close(),
      run: (sql, params = []) => {
        const stmt = db.prepare(sql);
        if (params.length) {
          stmt.bind(params);
        }
        stmt.step();
        stmt.free();
        saveDatabase(db);
        return { changes: db.getRowsModified() };
      },
      getRowsModified: () => db.getRowsModified(),
      export: () => db.export()
    };

    console.log(`✓ SQLite database initialized at: ${DB_PATH}`);
    return wrappedDb;
  } catch (err) {
    console.error('Database initialization error:', err.message);
    throw err;
  }
}

function isDatabaseInitialized() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return false;
    }

    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');

    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();

    db.close();
    return !!result;
  } catch (err) {
    console.error('Database check error:', err.message);
    return false;
  }
}

function isSetupCompleted(db) {
  try {
    const stmt = db.prepare('SELECT value FROM system_config WHERE key = ?');
    const result = stmt.get('initial_setup_completed');
    return result?.value === 'true';
  } catch (err) {
    console.error('Setup status check error:', err.message);
    return false;
  }
}

function setSetupCompleted(db, completed = true) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO system_config (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    const now = Math.floor(Date.now() / 1000);
    stmt.run('initial_setup_completed', completed ? 'true' : 'false', now);
    console.log(`✓ Setup completed flag set to: ${completed}`);
  } catch (err) {
    console.error('Setup flag error:', err.message);
  }
}

function hasSuperAdmin(db) {
  try {
    const stmt = db.prepare(`
      SELECT id FROM users
      WHERE role = 'super_admin' AND status = 'active'
      LIMIT 1
    `);

    const result = stmt.get();
    return !!result;
  } catch (err) {
    console.error('Super admin check error:', err.message);
    return false;
  }
}

function resetDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
      console.log(`✓ Database reset: ${DB_PATH} deleted`);
    }
  } catch (err) {
    console.error('Database reset error:', err.message);
  }
}

module.exports = {
  initDatabase,
  isDatabaseInitialized,
  isSetupCompleted,
  setSetupCompleted,
  hasSuperAdmin,
  resetDatabase
};
