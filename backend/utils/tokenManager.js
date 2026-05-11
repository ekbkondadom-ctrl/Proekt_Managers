/**
 * utils/tokenManager.js
 * 
 * Управление JWT токенами для авторизации
 */

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-not-for-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Генерирует JWT токен для пользователя
 * @param {Object} userData - Данные пользователя
 * @param {string} userData.userId - ID пользователя
 * @param {string} userData.role - Роль пользователя (manager, admin, super_admin)
 * @param {string|null} userData.adminId - ID админа (для менеджеров и админов)
 * @returns {string} JWT токен
 */
function generateToken(userData) {
  const payload = {
    userId: userData.userId,
    role: userData.role,
    adminId: userData.adminId || null,
    iat: Math.floor(Date.now() / 1000),
  };

  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      algorithm: 'HS256'
    });
    return token;
  } catch (err) {
    throw new Error(`Token generation failed: ${err.message}`);
  }
}

/**
 * Проверяет и декодирует JWT токен
 * @param {string} token - JWT токен
 * @returns {Object|null} Декодированный payload или null если токен невалиден
 */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Декодирует токен БЕЗ проверки подписи (только для инспекции)
 * ОСТОРОЖНО: используется только для отладки!
 * @param {string} token - JWT токен
 * @returns {Object|null} Декодированный payload или null
 */
function decodeToken(token) {
  try {
    const payload = jwt.decode(token);
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Проверяет истек ли токен
 * @param {string} token - JWT токен
 * @returns {boolean} true если токен еще действителен
 */
function isTokenValid(token) {
  const payload = verifyToken(token);
  return payload !== null;
}

/**
 * Получает информацию об истечении токена
 * @param {string} token - JWT токен
 * @returns {Object} { isExpired: boolean, expiresAt: Date|null, secondsLeft: number|null }
 */
function getTokenExpiration(token) {
  const payload = decodeToken(token);
  
  if (!payload || !payload.exp) {
    return { isExpired: true, expiresAt: null, secondsLeft: null };
  }

  const expiresAt = new Date(payload.exp * 1000);
  const now = Date.now();
  const expiresTime = payload.exp * 1000;
  const secondsLeft = Math.max(0, Math.floor((expiresTime - now) / 1000));

  return {
    isExpired: now > expiresTime,
    expiresAt: expiresAt,
    secondsLeft: secondsLeft
  };
}

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  isTokenValid,
  getTokenExpiration
};
