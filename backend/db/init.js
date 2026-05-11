/**
 * db/init.js
 * 
 * Инициализация хранилища данных (JSON-based)
 * Простое решение для разработки, легко мигрировать на БД позже
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Убедимся, что директория существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Инициализирует хранилище данных
 * @returns {Object} Экземпляр БД
 */
function initDatabase() {
  try {
    // Создаем пустые файлы если они не существуют
    const ensureFile = (filePath, defaultContent = []) => {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
      }
    };

    ensureFile(USERS_FILE, []);
    ensureFile(PROJECTS_FILE, []);
    ensureFile(SETTINGS_FILE, []);
    ensureFile(LOGS_FILE, []);
    ensureFile(CONFIG_FILE, { 
      initial_setup_completed: false,
      created_at: Date.now() 
    });

    console.log(`✓ Data storage initialized at: ${DATA_DIR}`);
    
    // Возвращаем объект "БД" с методами
    return {
      prepare: (sql) => new MockStatement(sql),
      exec: (sql) => {},
      pragma: () => {},
      close: () => {},
      run: () => {}
    };

  } catch (err) {
    console.error('Storage initialization error:', err.message);
    throw err;
  }
}

/**
 * Проверяет существует ли БД и она инициализирована
 * @returns {boolean} true если БД существует и инициализирована
 */
function isDatabaseInitialized() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return false;
    }
    
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');
    
    // Проверяем существует ли основная таблица
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();
    
    db.close();
    return result ? true : false;
  } catch (err) {
    console.error('Database check error:', err.message);
    return false;
  }
}

/**
 * Получает статус первичной настройки системы
 * @param {Database} db - Экземпляр БД
 * @returns {boolean} true если первичная настройка завершена
 */
function isSetupCompleted(db) {
  try {
    const stmt = db.prepare('SELECT value FROM system_config WHERE key = ?');
    const result = stmt.get('initial_setup_completed');
    
    if (!result) return false;
    return result.value === 'true';
  } catch (err) {
    console.error('Setup status check error:', err.message);
    return false;
  }
}

/**
 * Устанавливает флаг завершения первичной настройки
 * @param {Database} db - Экземпляр БД
 * @param {boolean} completed - true для завершения
 */
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

/**
 * Проверяет есть ли супер-админ в системе
 * @param {Database} db - Экземпляр БД
 * @returns {boolean} true если супер-админ существует и активен
 */
function hasSuperAdmin(db) {
  try {
    const stmt = db.prepare(`
      SELECT id FROM users 
      WHERE role = 'super_admin' AND status = 'active' 
      LIMIT 1
    `);
    
    const result = stmt.get();
    return result ? true : false;
  } catch (err) {
    console.error('Super admin check error:', err.message);
    return false;
  }
}

/**
 * Сбрасывает БД (удаляет файл БД)
 * ОСТОРОЖНО: это необратимо!
 */
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
