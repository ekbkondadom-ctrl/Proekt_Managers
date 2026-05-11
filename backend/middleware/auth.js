/**
 * middleware/auth.js
 * 
 * Middleware для проверки JWT авторизации
 * Извлекает токен из заголовка Authorization и добавляет req.user
 */

const { verifyToken } = require('../utils/tokenManager');
const { logConsole } = require('../utils/logger');

/**
 * Middleware: проверяет JWT токен в Authorization header
 * Если токен валиден - добавляет req.user с данными пользователя
 * Если нет - возвращает 401 Unauthorized
 */
function authMiddleware(req, res, next) {
  try {
    // Получаем Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logConsole('warn', 'Missing Authorization header', { url: req.path });
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing',
        code: 'AUTH_MISSING'
      });
    }

    // Парсим "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logConsole('warn', 'Invalid Authorization header format', { header: authHeader });
      return res.status(401).json({
        success: false,
        error: 'Invalid Authorization header format',
        code: 'AUTH_INVALID_FORMAT'
      });
    }

    const token = parts[1];

    // Проверяем токен
    const payload = verifyToken(token);
    if (!payload) {
      logConsole('warn', 'Invalid or expired token', { token: token.substring(0, 20) + '...' });
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
    }

    // Добавляем пользователя в request
    req.user = {
      userId: payload.userId,
      role: payload.role,
      adminId: payload.adminId
    };

    // IP адрес для логирования
    req.ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    logConsole('debug', 'Auth middleware: user authenticated', {
      userId: req.user.userId,
      role: req.user.role
    });

    next();
  } catch (err) {
    logConsole('error', 'Auth middleware error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Middleware: опциональная авторизация
 * Если токен есть - проверяет его, если нет - req.user остается undefined
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      
      if (payload) {
        req.user = {
          userId: payload.userId,
          role: payload.role,
          adminId: payload.adminId
        };
      }
    }

    req.ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    next();
  } catch (err) {
    logConsole('error', 'Optional auth middleware error', { error: err.message });
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};
