/**
 * routes/system.js
 * 
 * Системные маршруты:
 * - GET /api/system/status - Проверить статус первичной настройки и наличие супер-админа
 * - POST /api/system/setup - Создать первого супер-админа (только если его нет)
 */

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');

const { hashPassword } = require('../utils/passwordHash');
const { generateToken } = require('../utils/tokenManager');
const { isSetupCompleted, setSetupCompleted, hasSuperAdmin } = require('../db/init');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction, logConsole } = require('../utils/logger');

/**
 * GET /api/system/status
 * Проверить статус первичной настройки и наличие супер-админа
 * 
 * Response:
 * {
 *   hasSuperAdmin: boolean,
 *   setupCompleted: boolean,
 *   currentUser: { id, role, name } || null (если авторизован)
 * }
 */
router.get('/status', asyncHandler(async (req, res) => {
  const db = req.db;

  try {
    const setupDone = isSetupCompleted(db);
    const hasSuperAdminUser = hasSuperAdmin(db);

    // Информация о текущем пользователе (если авторизован)
    let currentUser = null;
    if (req.user) {
      const stmt = db.prepare(`
        SELECT id, name, role FROM users WHERE id = ? LIMIT 1
      `);
      currentUser = stmt.get(req.user.userId);
    }

    logConsole('debug', 'System status check', {
      setupCompleted: setupDone,
      hasSuperAdmin: hasSuperAdminUser,
      hasUser: !!currentUser
    });

    return res.json({
      success: true,
      hasSuperAdmin: hasSuperAdminUser,
      setupCompleted: setupDone,
      currentUser: currentUser ? {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role
      } : null
    });

  } catch (err) {
    logConsole('error', 'System status error', { error: err.message });
    throw err;
  }
}));

/**
 * POST /api/system/setup
 * Создать первого супер-админа
 * 
 * Это можно вызвать ТОЛЬКО если:
 * 1. Супер-админа еще нет
 * 2. initial_setup_completed = false
 * 
 * Request:
 * {
 *   name: string,
 *   login: string (уникальный),
 *   email: string,
 *   password: string
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   token: JWT токен,
 *   user: { id, name, role, login, email }
 * }
 */
router.post('/setup', asyncHandler(async (req, res) => {
  const db = req.db;
  const { name, login, email, password } = req.body;
  const ipAddress = req.ipAddress;

  try {
    // Проверяем статус
    const setupDone = isSetupCompleted(db);
    const hasSuperAdminUser = hasSuperAdmin(db);

    if (setupDone || hasSuperAdminUser) {
      logConsole('warn', 'Setup attempt when setup already completed', {
        setupCompleted: setupDone,
        hasSuperAdmin: hasSuperAdminUser,
        ip: ipAddress
      });

      return res.status(400).json({
        success: false,
        error: 'Setup already completed',
        code: 'SETUP_ALREADY_DONE'
      });
    }

    // Валидация
    if (!name || !login || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: name, login, email, password',
        code: 'MISSING_FIELDS'
      });
    }

    if (login.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Login must be at least 3 characters',
        code: 'INVALID_LOGIN'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    // Проверяем уникальность логина
    const checkStmt = db.prepare('SELECT id FROM users WHERE login = ? LIMIT 1');
    if (checkStmt.get(login)) {
      return res.status(409).json({
        success: false,
        error: 'Login already exists',
        code: 'LOGIN_EXISTS'
      });
    }

    // Хешируем пароль
    const passwordHash = await hashPassword(password);

    // Создаем супер-админа
    const userId = uuid();
    const now = Math.floor(Date.now() / 1000);

    const insertStmt = db.prepare(`
      INSERT INTO users (
        id, name, login, email, password_hash, plain_password, role, status,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      userId,
      name,
      login,
      email,
      passwordHash,
      password,
      'super_admin',
      'active',
      now,
      now,
      userId,
      userId
    );

    // Устанавливаем флаг завершения первичной настройки
    setSetupCompleted(db, true);

    // Логируем создание супер-админа
    logAction(db, {
      userId: userId,
      userRole: 'super_admin',
      action: 'setup_complete',
      description: `First super admin created during initial setup: ${name} (${login})`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    // Генерируем токен
    const token = generateToken({
      userId: userId,
      role: 'super_admin',
      adminId: null
    });

    logConsole('info', 'First super admin created', {
      userId: userId,
      name: name,
      login: login
    });

    return res.status(201).json({
      success: true,
      message: 'Super admin created successfully. Setup completed.',
      token: token,
      user: {
        id: userId,
        name: name,
        role: 'super_admin',
        login: login,
        email: email
      }
    });

  } catch (err) {
    logConsole('error', 'Setup error', { error: err.message });
    
    // Проверяем это constraint ошибка
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: 'Login or email already exists',
        code: 'DUPLICATE_ENTRY'
      });
    }

    throw err;
  }
}));

module.exports = router;
