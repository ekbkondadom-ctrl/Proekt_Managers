/**
 * middleware/rbac.js
 * 
 * RBAC (Role-Based Access Control) middleware
 * Проверяет есть ли у пользователя нужная роль
 */

const { logConsole } = require('../utils/logger');

/**
 * Создает middleware для проверки ролей
 * @param {...string} allowedRoles - Разрешённые роли
 * @returns {Function} Middleware функция
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Проверяем есть ли user (должен быть установлен authMiddleware)
    if (!req.user) {
      logConsole('warn', 'RBAC: No user in request');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Проверяем роль
    if (!allowedRoles.includes(req.user.role)) {
      logConsole('warn', 'RBAC: Insufficient permissions', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRole: allowedRoles[0]
      });
    }

    next();
  };
}

/**
 * Middleware: только супер-админ
 */
const onlySuperAdmin = requireRole('super_admin');

/**
 * Middleware: только админ или супер-админ
 */
const adminOrSuperAdmin = requireRole('admin', 'super_admin');

/**
 * Middleware: любая авторизованная роль (включая менеджера)
 */
const anyRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated',
      code: 'NOT_AUTHENTICATED'
    });
  }
  next();
};

/**
 * Проверяет может ли пользователь управлять проектом админа
 * Админ может управлять только своими проектами
 * Супер-админ может управлять любыми
 * Менеджер НЕ может управлять
 * @param {string} targetAdminId - ID админа, которому принадлежит проект
 * @returns {Function} Middleware функция
 */
function canManageProject(targetAdminId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Супер-админ может все
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Админ может только свои проекты
    if (req.user.role === 'admin' && req.user.adminId === targetAdminId) {
      return next();
    }

    // Менеджер не может управлять проектами
    logConsole('warn', 'RBAC: Cannot manage this project', {
      userId: req.user.userId,
      userRole: req.user.role,
      targetAdminId: targetAdminId,
      userAdminId: req.user.adminId
    });

    return res.status(403).json({
      success: false,
      error: 'Cannot manage this project',
      code: 'FORBIDDEN'
    });
  };
}

/**
 * Проверяет может ли пользователь видеть данные админа
 * Админ видит только свои данные
 * Менеджер видит данные своего админа
 * Супер-админ видит все
 * @param {string} dataAdminId - ID админа, которому принадлежат данные
 * @returns {Function} Middleware функция
 */
function canViewData(dataAdminId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Супер-админ видит все
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Админ видит только свои данные
    if (req.user.role === 'admin') {
      if (req.user.userId === dataAdminId) {
        return next();
      }
    }

    // Менеджер видит данные своего админа
    if (req.user.role === 'manager') {
      if (req.user.adminId === dataAdminId) {
        return next();
      }
    }

    logConsole('warn', 'RBAC: Cannot view this data', {
      userId: req.user.userId,
      userRole: req.user.role,
      dataAdminId: dataAdminId,
      userAdminId: req.user.adminId
    });

    return res.status(403).json({
      success: false,
      error: 'Cannot view this data',
      code: 'FORBIDDEN'
    });
  };
}

module.exports = {
  requireRole,
  onlySuperAdmin,
  adminOrSuperAdmin,
  anyRole,
  canManageProject,
  canViewData
};
