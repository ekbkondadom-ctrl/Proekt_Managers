/**
 * routes/auth.js
 * 
 * Маршруты для авторизации:
 * - POST /api/auth/login - Вход
 * - POST /api/auth/logout - Выход
 * - GET /api/auth/check - Проверка статуса сессии
 */

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');

const { hashPassword, verifyPassword } = require('../utils/passwordHash');
const { generateToken } = require('../utils/tokenManager');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction, logConsole } = require('../utils/logger');

/**
 * POST /api/auth/login
 * Вход в систему по логину и паролю
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { login, password } = req.body;
  const db = req.db;
  const ipAddress = req.ipAddress;

  // Валидация
  if (!login || !password) {
    logConsole('warn', 'Login attempt with missing credentials', { ip: ipAddress });
    return res.status(400).json({
      success: false,
      error: 'Login and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  try {
    // Ищем пользователя по логину
    const stmt = db.prepare(`
      SELECT * FROM users WHERE login = ? LIMIT 1
    `);
    const user = stmt.get(login);

    if (!user) {
      // Логируем неудачную попытку
      logAction(db, {
        userId: null,
        userRole: null,
        action: 'login_failed',
        description: `Failed login attempt with login: ${login}`,
        targetType: null,
        targetId: null,
        ipAddress: ipAddress
      });

      logConsole('warn', 'Login failed: user not found', { login, ip: ipAddress });
      
      // Возвращаем универсальное сообщение (не раскрываем существует ли пользователь)
      return res.status(401).json({
        success: false,
        error: 'Invalid login or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Проверяем статус пользователя
    if (user.status !== 'active') {
      logAction(db, {
        userId: user.id,
        userRole: user.role,
        action: 'login_blocked',
        description: `Login attempt by blocked user: ${user.login}`,
        targetType: null,
        targetId: null,
        ipAddress: ipAddress
      });

      logConsole('warn', 'Login blocked: user inactive', { userId: user.id, status: user.status });
      
      return res.status(403).json({
        success: false,
        error: 'Account is blocked',
        code: 'ACCOUNT_BLOCKED'
      });
    }

    // Проверяем пароль
    const passwordMatch = await verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      // Логируем неудачную попытку
      logAction(db, {
        userId: user.id,
        userRole: user.role,
        action: 'login_failed',
        description: `Failed login attempt with correct login but wrong password`,
        targetType: null,
        targetId: null,
        ipAddress: ipAddress
      });

      logConsole('warn', 'Login failed: wrong password', { userId: user.id, ip: ipAddress });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid login or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Обновляем last_login_at
    const updateStmt = db.prepare(`
      UPDATE users SET last_login_at = ? WHERE id = ?
    `);
    const now = Math.floor(Date.now() / 1000);
    updateStmt.run(now, user.id);

    // Логируем успешный вход
    logAction(db, {
      userId: user.id,
      userRole: user.role,
      action: 'login_success',
      description: `Successful login: ${user.name} (${user.login})`,
      targetType: null,
      targetId: null,
      ipAddress: ipAddress
    });

    // Генерируем токен
    const token = generateToken({
      userId: user.id,
      role: user.role,
      adminId: user.admin_id
    });

    logConsole('info', 'User logged in successfully', {
      userId: user.id,
      role: user.role,
      login: user.login
    });

    // Возвращаем токен и данные пользователя
    return res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: user.role,
        adminId: user.admin_id
      }
    });

  } catch (err) {
    logConsole('error', 'Login error', { error: err.message });
    throw err;
  }
}));

/**
 * POST /api/auth/logout
 * Выход из системы
 */
router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  const db = req.db;
  const userId = req.user.userId;
  const userRole = req.user.role;
  const ipAddress = req.ipAddress;

  // Логируем выход
  logAction(db, {
    userId: userId,
    userRole: userRole,
    action: 'logout',
    description: 'User logged out',
    targetType: null,
    targetId: null,
    ipAddress: ipAddress
  });

  logConsole('info', 'User logged out', { userId, role: userRole });

  return res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * GET /api/auth/check
 * Проверка статуса авторизации (валидация токена)
 */
router.get('/check', authMiddleware, asyncHandler(async (req, res) => {
  const db = req.db;
  const userId = req.user.userId;

  try {
    // Получаем данные пользователя
    const stmt = db.prepare(`
      SELECT id, name, login, email, role, admin_id, status 
      FROM users WHERE id = ? LIMIT 1
    `);
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Проверяем статус пользователя
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is no longer active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: user.role,
        adminId: user.admin_id,
        status: user.status
      }
    });

  } catch (err) {
    logConsole('error', 'Auth check error', { error: err.message });
    throw err;
  }
}));

module.exports = router;
