/**
 * utils/logger.js
 * 
 * Утилита для логирования действий пользователей в БД
 */

/**
 * Логирует действие пользователя в таблицу activity_logs
 * @param {Database} db - Экземпляр БД (better-sqlite3)
 * @param {Object} logData - Данные для логирования
 * @param {string} logData.userId - ID пользователя
 * @param {string} logData.userRole - Роль пользователя
 * @param {string} logData.action - Действие (login, logout, create_user, etc)
 * @param {string} logData.description - Описание действия
 * @param {string} logData.targetType - Тип объекта (user, project, setting, etc)
 * @param {string} logData.targetId - ID объекта
 * @param {string} logData.ipAddress - IP адрес клиента
 * @returns {Object|null} Созданная запись логов или null при ошибке
 */
function logAction(db, logData) {
  try {
    const { v4: uuid } = require('uuid');
    
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO activity_logs (
        id, user_id, user_role, action, description, 
        target_type, target_id, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      id,
      logData.userId || null,
      logData.userRole || null,
      logData.action || 'unknown',
      logData.description || null,
      logData.targetType || null,
      logData.targetId || null,
      logData.ipAddress || null,
      now
    );

    if (result.changes === 1) {
      return { id, ...logData, created_at: now };
    }
    return null;
  } catch (err) {
    console.error('Logging error:', err.message);
    return null;
  }
}

/**
 * Получает логи действий
 * @param {Database} db - Экземпляр БД
 * @param {Object} filters - Фильтры для поиска
 * @param {string} filters.userId - Фильтр по userId
 * @param {string} filters.action - Фильтр по действию
 * @param {number} filters.limit - Максимальное количество записей
 * @param {number} filters.offset - Смещение
 * @returns {Array} Массив логов
 */
function getLogs(db, filters = {}) {
  try {
    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.targetType) {
      query += ' AND target_type = ?';
      params.push(filters.targetType);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = db.prepare(query);
    const logs = stmt.all(...params);
    
    return logs || [];
  } catch (err) {
    console.error('Get logs error:', err.message);
    return [];
  }
}

/**
 * Удаляет старые логи (старше N дней)
 * @param {Database} db - Экземпляр БД
 * @param {number} daysOld - Удалить логи старше N дней
 * @returns {number} Количество удаленных записей
 */
function cleanOldLogs(db, daysOld = 90) {
  try {
    const secondsOld = daysOld * 24 * 60 * 60;
    const cutoffTime = Math.floor(Date.now() / 1000) - secondsOld;

    const stmt = db.prepare('DELETE FROM activity_logs WHERE created_at < ?');
    const result = stmt.run(cutoffTime);
    
    return result.changes;
  } catch (err) {
    console.error('Clean logs error:', err.message);
    return 0;
  }
}

// Логирование в консоль (для разработки)
function logConsole(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

module.exports = {
  logAction,
  getLogs,
  cleanOldLogs,
  logConsole
};
