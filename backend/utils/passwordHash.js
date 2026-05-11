/**
 * utils/passwordHash.js
 * 
 * Утилиты для хеширования и проверки паролей с использованием bcryptjs
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Хеширует пароль используя bcryptjs
 * @param {string} password - Открытый пароль
 * @returns {Promise<string>} Хешированный пароль
 */
async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (err) {
    throw new Error(`Password hash failed: ${err.message}`);
  }
}

/**
 * Проверяет пароль против хеша
 * @param {string} password - Открытый пароль
 * @param {string} hash - Хешированный пароль из БД
 * @returns {Promise<boolean>} true если пароли совпадают
 */
async function verifyPassword(password, hash) {
  try {
    const match = await bcrypt.compare(password, hash);
    return match;
  } catch (err) {
    throw new Error(`Password verification failed: ${err.message}`);
  }
}

/**
 * Генерирует случайный пароль
 * @returns {string} Случайный пароль из 16 символов
 */
function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateRandomPassword
};
