/**
 * routes/settings.js
 * 
 * Маршруты для управления настройками с изоляцией по админам
 * - GET /api/settings - Получить настройки текущего админа
 * - PUT /api/settings - Обновить настройку
 */

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');

const { anyRole } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction, logConsole } = require('../utils/logger');

/**
 * GET /api/settings
 * Получить все настройки текущего админа
 * 
 * Админ получает свои настройки
 * Менеджер получает настройки своего админа
 * Супер-админ может получить настройки конкретного админа (query параметр adminId=<id>)
 */
router.get('/', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const { adminId } = req.query;

  // Определяем чьи настройки запрашивают
  let targetAdminId;
  if (user.role === 'super_admin' && adminId) {
    targetAdminId = adminId;
  } else if (user.role === 'admin') {
    targetAdminId = user.userId;
  } else if (user.role === 'manager') {
    targetAdminId = user.adminId;
  } else {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  }

  try {
    const stmt = db.prepare(`
      SELECT setting_key, setting_value FROM settings 
      WHERE owner_admin_id = ?
      ORDER BY setting_key
    `);
    
    const settingsArray = stmt.all(targetAdminId);

    // Преобразуем в объект
    const settings = {};
    settingsArray.forEach(s => {
      settings[s.setting_key] = tryParseJSON(s.setting_value);
    });

    logConsole('debug', 'Settings retrieved', {
      userId: user.userId,
      targetAdminId: targetAdminId,
      count: settingsArray.length
    });

    return res.json({
      success: true,
      settings: settings
    });

  } catch (err) {
    logConsole('error', 'Get settings error', { error: err.message });
    throw err;
  }
}));

/**
 * PUT /api/settings
 * Обновить или создать настройку
 * 
 * Request:
 * {
 *   settings: {
 *     "key1": "value1",
 *     "key2": { nested: "object" },
 *     ...
 *   }
 * }
 * или для одной настройки:
 * {
 *   key: "setting_key",
 *   value: "setting_value"
 * }
 */
router.put('/', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const ipAddress = req.ipAddress;
  const { settings, key, value } = req.body;

  // Определяем owner_admin_id
  let ownerAdminId;
  if (user.role === 'admin') {
    ownerAdminId = user.userId;
  } else if (user.role === 'manager') {
    ownerAdminId = user.adminId;
  } else if (user.role === 'super_admin') {
    // Супер-админ может обновлять чьи-то настройки если указано
    ownerAdminId = req.body.adminId || user.userId;
  } else {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const upsertStmt = db.prepare(`
      INSERT OR REPLACE INTO settings (id, owner_admin_id, setting_key, setting_value, created_at, updated_at)
      VALUES (
        (SELECT id FROM settings WHERE owner_admin_id = ? AND setting_key = ? LIMIT 1),
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `);

    let updated = 0;
    let settingsToUpdate = {};

    // Обрабатываем различные форматы запроса
    if (key && value !== undefined) {
      // Один ключ-значение
      settingsToUpdate[key] = value;
    } else if (settings && typeof settings === 'object') {
      // Объект с несколькими настройками
      settingsToUpdate = settings;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format',
        code: 'INVALID_FORMAT'
      });
    }

    // Обновляем каждую настройку
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO settings (id, owner_admin_id, setting_key, setting_value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const [settingKey, settingValue] of Object.entries(settingsToUpdate)) {
      const settingId = uuid();
      const settingValueStr = typeof settingValue === 'string' 
        ? settingValue 
        : JSON.stringify(settingValue);

      // Сначала проверяем существует ли
      const checkStmt = db.prepare(`
        SELECT id FROM settings WHERE owner_admin_id = ? AND setting_key = ? LIMIT 1
      `);
      const existing = checkStmt.get(ownerAdminId, settingKey);

      if (existing) {
        // Обновляем
        const updateStmt = db.prepare(`
          UPDATE settings SET setting_value = ?, updated_at = ? 
          WHERE owner_admin_id = ? AND setting_key = ?
        `);
        updateStmt.run(settingValueStr, now, ownerAdminId, settingKey);
      } else {
        // Создаем
        insertStmt.run(settingId, ownerAdminId, settingKey, settingValueStr, now, now);
      }

      updated++;
    }

    // Логируем обновление настроек
    logAction(db, {
      userId: user.userId,
      userRole: user.role,
      action: 'settings_updated',
      description: `Updated ${updated} setting(s)`,
      targetType: 'settings',
      targetId: ownerAdminId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Settings updated', {
      userId: user.userId,
      ownerAdminId: ownerAdminId,
      count: updated
    });

    return res.json({
      success: true,
      message: `${updated} setting(s) updated successfully`,
      updated: updated
    });

  } catch (err) {
    logConsole('error', 'Update settings error', { error: err.message });
    throw err;
  }
}));

/**
 * GET /api/settings/:key
 * Получить одну настройку
 */
router.get('/:key', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const settingKey = req.params.key;

  // Определяем чьи настройки запрашивают
  let targetAdminId;
  if (user.role === 'admin') {
    targetAdminId = user.userId;
  } else if (user.role === 'manager') {
    targetAdminId = user.adminId;
  } else if (user.role === 'super_admin') {
    targetAdminId = user.userId; // Супер-админ видит свои
  } else {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  }

  try {
    const stmt = db.prepare(`
      SELECT setting_value FROM settings 
      WHERE owner_admin_id = ? AND setting_key = ?
      LIMIT 1
    `);

    const result = stmt.get(targetAdminId, settingKey);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found',
        code: 'SETTING_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      key: settingKey,
      value: tryParseJSON(result.setting_value)
    });

  } catch (err) {
    logConsole('error', 'Get setting error', { error: err.message });
    throw err;
  }
}));

/**
 * DELETE /api/settings/:key
 * Удалить одну настройку
 */
router.delete('/:key', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const settingKey = req.params.key;
  const ipAddress = req.ipAddress;

  // Определяем чьи настройки удаляют
  let targetAdminId;
  if (user.role === 'admin') {
    targetAdminId = user.userId;
  } else if (user.role === 'manager') {
    targetAdminId = user.adminId;
  } else if (user.role === 'super_admin') {
    targetAdminId = user.userId;
  } else {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  }

  try {
    // Удаляем
    const stmt = db.prepare(`
      DELETE FROM settings 
      WHERE owner_admin_id = ? AND setting_key = ?
    `);

    const result = stmt.run(targetAdminId, settingKey);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Setting not found',
        code: 'SETTING_NOT_FOUND'
      });
    }

    // Логируем удаление
    logAction(db, {
      userId: user.userId,
      userRole: user.role,
      action: 'setting_deleted',
      description: `Deleted setting: ${settingKey}`,
      targetType: 'settings',
      targetId: targetAdminId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Setting deleted', { settingKey });

    return res.json({
      success: true,
      message: 'Setting deleted successfully'
    });

  } catch (err) {
    logConsole('error', 'Delete setting error', { error: err.message });
    throw err;
  }
}));

/**
 * Вспомогательная функция: безопасная парсинг JSON
 */
function tryParseJSON(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch (e) {
    return str || null;
  }
}

module.exports = router;
