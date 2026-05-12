/**
 * routes/users.js
 * 
 * Маршруты для управления пользователями (только супер-админ)
 * - GET /api/users - Список пользователей
 * - POST /api/users - Создать пользователя
 * - GET /api/users/:id - Получить пользователя
 * - PUT /api/users/:id - Редактировать пользователя
 * - DELETE /api/users/:id - Удалить пользователя
 * - POST /api/users/:id/password - Установить новый пароль
 */

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');

const { onlySuperAdmin, adminOrSuperAdmin } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/errorHandler');
const { hashPassword, generateRandomPassword } = require('../utils/passwordHash');
const { logAction, logConsole } = require('../utils/logger');

/**
 * GET /api/users
 * Список пользователей (только супер-админ)
 * 
 * Query параметры:
 * - role: 'manager' | 'admin' | 'super_admin' (фильтр по роли)
 * - status: 'active' | 'blocked' (фильтр по статусу)
 * - search: string (поиск по name, login, email)
 * - limit: number (максимум результатов)
 * - offset: number (смещение)
 */
router.get('/', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const requestingUser = req.user;

  const { role, status, search, limit = 50, offset = 0 } = req.query;

  try {
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    // Администратор видит только своих менеджеров
    if (requestingUser.role === 'admin') {
      query += ' AND admin_id = ?';
      params.push(requestingUser.userId);
    }

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (name LIKE ? OR login LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const stmt = db.prepare(query);
    const users = stmt.all(...params);

    // Получаем общее количество
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams = [];

    if (requestingUser.role === 'admin') {
      countQuery += ' AND admin_id = ?';
      countParams.push(requestingUser.userId);
    }
    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (search) {
      countQuery += ' AND (name LIKE ? OR login LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countStmt = db.prepare(countQuery);
    const countResult = countStmt.get(...countParams);
    const total = countResult?.count || 0;

    // Удаляем пароли из результатов
    const safeUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      login: u.login,
      email: u.email,
      role: u.role,
      status: u.status,
      adminId: u.admin_id,
      permissions: u.permissions ? JSON.parse(u.permissions) : null,
      plainPassword: requestingUser.role === 'super_admin' ? (u.plain_password || null) : undefined,
      allowedProjectIds: u.allowed_project_ids ? JSON.parse(u.allowed_project_ids) : null,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      lastLoginAt: u.last_login_at
    }));

    logConsole('debug', 'Users list requested', {
      requestingUserId: requestingUser.userId,
      requestingRole: requestingUser.role,
      filters: { role, status, search },
      count: safeUsers.length,
      total
    });

    return res.json({
      success: true,
      users: safeUsers,
      pagination: {
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: safeUsers.length
      }
    });

  } catch (err) {
    logConsole('error', 'Get users error', { error: err.message });
    throw err;
  }
}));

/**
 * POST /api/users
 * Создать пользователя (только супер-админ)
 * 
 * Request:
 * {
 *   name: string,
 *   login: string,
 *   email: string,
 *   password: string,
 *   role: 'manager' | 'admin',
 *   adminId: string (если role='manager', обязательно указать админа)
 * }
 */
router.post('/', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const creatorId = req.user.userId;
  const creatorRole = req.user.role;
  const { name, login, email, password, role, adminId } = req.body;
  const ipAddress = req.ipAddress;

  try {
    // Валидация
    if (!name || !login || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        code: 'MISSING_FIELDS'
      });
    }

    if (!['manager', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be "manager" or "admin"',
        code: 'INVALID_ROLE'
      });
    }

    // Admin can only create managers
    if (creatorRole === 'admin' && role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Admin can only create managers',
        code: 'FORBIDDEN'
      });
    }

    // Determine adminId: admin auto-assigns to self
    const resolvedAdminId = role === 'manager'
      ? (creatorRole === 'admin' ? creatorId : adminId)
      : null;

    if (role === 'manager' && !resolvedAdminId) {
      return res.status(400).json({
        success: false,
        error: 'adminId is required for managers',
        code: 'MISSING_ADMIN_ID'
      });
    }

    if (login.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Login must be at least 3 characters',
        code: 'INVALID_LOGIN'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
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

    // Проверяем существует ли указанный админ
    if (resolvedAdminId && creatorRole === 'super_admin') {
      const adminCheckStmt = db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
      if (!adminCheckStmt.get(resolvedAdminId)) {
        return res.status(400).json({
          success: false,
          error: 'Admin with specified ID not found',
          code: 'ADMIN_NOT_FOUND'
        });
      }
    }

    // Хешируем пароль
    const passwordHash = await hashPassword(password);

    // Создаем пользователя
    const userId = uuid();
    const now = Math.floor(Date.now() / 1000);

    const insertStmt = db.prepare(`
      INSERT INTO users (
        id, name, login, email, password_hash, plain_password, role, status,
        admin_id, created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      userId,
      name,
      login,
      email || null,
      passwordHash,
      password,
      role,
      'active',
      resolvedAdminId,
      now,
      now,
      creatorId,
      creatorId
    );

    // When super_admin creates a new admin — transfer all super_admin's projects to the new admin
    if (role === 'admin' && creatorRole === 'super_admin') {
      db.prepare('UPDATE projects SET owner_admin_id = ? WHERE owner_admin_id = ?')
        .run(userId, creatorId);
      logConsole('info', 'Projects transferred to new admin', { from: creatorId, to: userId });
    }

    // Auto-assign admin's projects to new manager
    if (role === 'manager' && resolvedAdminId) {
      const adminProjects = db.prepare('SELECT id FROM projects WHERE owner_admin_id = ?').all(resolvedAdminId);
      const projectIds = adminProjects.map(p => p.id);
      db.prepare('UPDATE users SET allowed_project_ids = ? WHERE id = ?')
        .run(JSON.stringify(projectIds), userId);
    }

    // Логируем создание пользователя
    logAction(db, {
      userId: creatorId,
      userRole: creatorRole,
      action: 'user_created',
      description: `Created new user: ${name} (${login}) with role: ${role}`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    logConsole('info', 'User created', { userId, login, role });

    return res.status(201).json({
      success: true,
      user: {
        id: userId,
        name: name,
        login: login,
        email: email || null,
        role: role,
        status: 'active',
        adminId: resolvedAdminId,
        createdAt: now
      }
    });

  } catch (err) {
    logConsole('error', 'Create user error', { error: err.message });
    throw err;
  }
}));

/**
 * GET /api/users/admin-stats
 * Статистика по каждому администратору (только супер-админ)
 * ВАЖНО: должен быть до /:id чтобы express не принял 'admin-stats' как id
 */
router.get('/admin-stats', onlySuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;

  try {
    const admins = db.prepare("SELECT id, name, login, last_login_at FROM users WHERE role = 'admin' AND status = 'active'").all();

    // Проекты без явного владельца-admin (созданы super_admin-ом) — при единственном admin они его
    const superAdminIds = db.prepare("SELECT id FROM users WHERE role = 'super_admin'").all().map(u => u.id);
    const orphanProjects = superAdminIds.length
      ? db.prepare(
          `SELECT name, owner_admin_id FROM projects WHERE owner_admin_id IN (${superAdminIds.map(()=>'?').join(',')}) ORDER BY created_at DESC`
        ).all(...superAdminIds)
      : [];

    const stats = admins.map(admin => {
      const ownProjects = db.prepare('SELECT name FROM projects WHERE owner_admin_id = ? ORDER BY created_at DESC').all(admin.id);
      // Если admin единственный — добавляем «бесхозные» проекты super_admin
      const extraProjects = admins.length === 1 ? orphanProjects : [];
      const allProjects = [...ownProjects, ...extraProjects];
      const managerCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE admin_id = ? AND role = 'manager' AND status = 'active'").get(admin.id)?.cnt || 0;
      return {
        id: admin.id,
        name: admin.name,
        login: admin.login,
        lastLoginAt: admin.last_login_at,
        projectCount: allProjects.length,
        projectNames: allProjects.map(p => p.name),
        managerCount
      };
    });

    return res.json({ success: true, stats });
  } catch (err) {
    logConsole('error', 'Admin stats error', { error: err.message });
    throw err;
  }
}));

/**
 * GET /api/users/:id
 * Получить пользователя (только супер-админ)
 */
router.get('/:id', onlySuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const userId = req.params.id;

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Удаляем пароль
    delete user.password_hash;

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: user.role,
        status: user.status,
        adminId: user.admin_id,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLoginAt: user.last_login_at
      }
    });

  } catch (err) {
    logConsole('error', 'Get user error', { error: err.message });
    throw err;
  }
}));

/**
 * PUT /api/users/:id
 * Редактировать пользователя (только супер-админ)
 */
router.put('/:id', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const superAdminId = req.user.userId;
  const requesterRole = req.user.role;
  const userId = req.params.id;
  const { name, login, email, role, status, adminId, password } = req.body;
  const ipAddress = req.ipAddress;

  try {
    // Получаем текущего пользователя
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Super admin cannot be modified by anyone except themselves
    if (user.role === 'super_admin' && user.id !== superAdminId) {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify another super admin',
        code: 'FORBIDDEN'
      });
    }

    // Admin can only edit own managers
    if (requesterRole === 'admin') {
      if (user.role !== 'manager' || user.admin_id !== superAdminId) {
        return res.status(403).json({
          success: false,
          error: 'Admin can only edit own managers',
          code: 'FORBIDDEN'
        });
      }
    }

    // Check login uniqueness if changing
    if (login && login !== user.login) {
      const loginCheck = db.prepare('SELECT id FROM users WHERE login = ? AND id != ? LIMIT 1');
      if (loginCheck.get(login, userId)) {
        return res.status(409).json({ success: false, error: 'Login already exists', code: 'LOGIN_EXISTS' });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const newName = name || user.name;
    const newLogin = login || user.login;
    const newRole = role || user.role;
    const newStatus = status || user.status;
    const newAdminId = (newRole === 'manager' && adminId) ? adminId : user.admin_id;

    // Обновляем поля (с паролем если передан)
    if (password && password.length >= 6) {
      const passwordHash = await hashPassword(password);
      const updateStmt = db.prepare(`
        UPDATE users SET name = ?, login = ?, email = ?, role = ?, status = ?, admin_id = ?,
          password_hash = ?, plain_password = ?, updated_at = ?, updated_by = ?
        WHERE id = ?
      `);
      updateStmt.run(newName, newLogin, email || user.email, newRole, newStatus, newAdminId,
        passwordHash, password, now, superAdminId, userId);
    } else {
      const updateStmt = db.prepare(`
        UPDATE users SET name = ?, login = ?, email = ?, role = ?, status = ?, admin_id = ?,
          updated_at = ?, updated_by = ?
        WHERE id = ?
      `);
      updateStmt.run(newName, newLogin, email || user.email, newRole, newStatus, newAdminId,
        now, superAdminId, userId);
    }

    // Обновляем список разрешённых проектов для менеджеров
    if (req.body.allowedProjectIds !== undefined && user.role !== 'admin') {
      db.prepare('UPDATE users SET allowed_project_ids = ? WHERE id = ?')
        .run(JSON.stringify(Array.isArray(req.body.allowedProjectIds) ? req.body.allowedProjectIds : []), userId);
    }

    // Перераспределение проектов для admin: super_admin назначает/снимает проекты
    if (req.body.ownedProjectIds !== undefined && requesterRole === 'super_admin' && user.role === 'admin') {
      const newOwnedIds = Array.isArray(req.body.ownedProjectIds) ? req.body.ownedProjectIds : [];
      // Return all current admin's projects back to super_admin
      db.prepare('UPDATE projects SET owner_admin_id = ? WHERE owner_admin_id = ?').run(superAdminId, userId);
      // Assign the selected projects to this admin
      if (newOwnedIds.length) {
        const placeholders = newOwnedIds.map(() => '?').join(',');
        db.prepare(`UPDATE projects SET owner_admin_id = ? WHERE id IN (${placeholders})`).run(userId, ...newOwnedIds);
      }
      logConsole('info', 'Admin project ownership updated', { adminId: userId, ownedCount: newOwnedIds.length });
    }

    // Логируем изменение
    const changes = [];
    if (name && name !== user.name) changes.push(`name: ${user.name} → ${name}`);
    if (login && login !== user.login) changes.push(`login: ${user.login} → ${login}`);
    if (role && role !== user.role) changes.push(`role: ${user.role} → ${role}`);
    if (status && status !== user.status) changes.push(`status: ${user.status} → ${status}`);
    if (password) changes.push('password changed');

    logAction(db, {
      userId: superAdminId,
      userRole: requesterRole,
      action: 'user_updated',
      description: `Updated user ${user.login}: ${changes.join(', ')}`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    logConsole('info', 'User updated', { userId, changes: changes.join(', ') });

    return res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (err) {
    logConsole('error', 'Update user error', { error: err.message });
    throw err;
  }
}));

/**
 * DELETE /api/users/:id
 * Удалить пользователя (только супер-админ)
 */
router.delete('/:id', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const requesterId = req.user.userId;
  const requesterRole = req.user.role;
  const userId = req.params.id;
  const ipAddress = req.ipAddress;

  try {
    // Проверяем существует ли пользователь
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Нельзя удалить супер-админа
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete super admin',
        code: 'FORBIDDEN'
      });
    }

    // Нельзя удалить самого себя
    if (user.id === requesterId) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete yourself',
        code: 'FORBIDDEN'
      });
    }

    // Admin can only delete their own managers
    if (requesterRole === 'admin') {
      if (user.role !== 'manager' || user.admin_id !== requesterId) {
        return res.status(403).json({
          success: false,
          error: 'Admin can only delete own managers',
          code: 'FORBIDDEN'
        });
      }
    }

    // Удаляем пользователя
    const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
    deleteStmt.run(userId);

    // Логируем удаление
    logAction(db, {
      userId: requesterId,
      userRole: requesterRole,
      action: 'user_deleted',
      description: `Deleted user: ${user.name} (${user.login})`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    logConsole('info', 'User deleted', { userId, login: user.login });

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (err) {
    logConsole('error', 'Delete user error', { error: err.message });
    throw err;
  }
}));

/**
 * POST /api/users/:id/password
 * Установить новый пароль (только супер-админ)
 */
router.post('/:id/password', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const requesterId = req.user.userId;
  const requesterRole = req.user.role;
  const userId = req.params.id;
  const newPassword = req.body.password || req.body.newPassword;
  const ipAddress = req.ipAddress;

  try {
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    // Проверяем существует ли пользователь
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Admin can only reset passwords for their own managers
    if (requesterRole === 'admin') {
      if (user.role !== 'manager' || user.admin_id !== requesterId) {
        return res.status(403).json({
          success: false,
          error: 'Admin can only reset passwords for own managers',
          code: 'FORBIDDEN'
        });
      }
    }

    // Хешируем новый пароль
    const passwordHash = await hashPassword(newPassword);

    // Обновляем пароль
    const updateStmt = db.prepare(`
      UPDATE users SET password_hash = ?, plain_password = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `);

    const now = Math.floor(Date.now() / 1000);
    updateStmt.run(passwordHash, newPassword, now, requesterId, userId);

    // Логируем смену пароля
    logAction(db, {
      userId: requesterId,
      userRole: requesterRole,
      action: 'password_reset',
      description: `Password reset for user: ${user.login}`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Password reset', { userId, login: user.login });

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (err) {
    logConsole('error', 'Password change error', { error: err.message });
    throw err;
  }
}));

/**
 * PATCH /api/users/:id/permissions
 * Установить права доступа для пользователя (только супер-админ)
 */
router.patch('/:id/permissions', onlySuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const requesterId = req.user.userId;
  const userId = req.params.id;
  const { permissions } = req.body;
  const ipAddress = req.ipAddress;

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    const user = stmt.get(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const now = Math.floor(Date.now() / 1000);
    const updateStmt = db.prepare('UPDATE users SET permissions = ?, updated_at = ?, updated_by = ? WHERE id = ?');
    updateStmt.run(JSON.stringify(permissions), now, requesterId, userId);

    logAction(db, {
      userId: requesterId,
      userRole: 'super_admin',
      action: 'permissions_updated',
      description: `Permissions updated for user: ${user.login}`,
      targetType: 'user',
      targetId: userId,
      ipAddress: ipAddress
    });

    return res.json({ success: true, message: 'Permissions updated' });
  } catch (err) {
    logConsole('error', 'Permissions update error', { error: err.message });
    throw err;
  }
}));


/**
 * PUT /api/users/:id/projects
 * Обновить список проектов пользователя
 * - Для manager: обновляет allowed_project_ids
 * - Для admin (вызов super_admin): переназначает owner_admin_id на проектах
 */
router.put('/:id/projects', adminOrSuperAdmin, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const targetUserId = req.params.id;
  const { projectIds } = req.body;

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ success: false, error: 'User not found', code: 'NOT_FOUND' });
  }

  if (user.role === 'admin' && targetUser.admin_id !== user.userId) {
    return res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
  }

  const now = Math.floor(Date.now() / 1000);
  const newIds = Array.isArray(projectIds) ? projectIds : [];

  if (targetUser.role === 'admin' && user.role === 'super_admin') {
    // Reassign owner_admin_id: return admin's current projects to super_admin, then assign selected
    db.prepare('UPDATE projects SET owner_admin_id = ? WHERE owner_admin_id = ?')
      .run(user.userId, targetUserId);
    if (newIds.length) {
      const placeholders = newIds.map(() => '?').join(',');
      db.prepare(`UPDATE projects SET owner_admin_id = ? WHERE id IN (${placeholders})`)
        .run(targetUserId, ...newIds);
    }
    logConsole('info', 'Admin project ownership updated', { adminId: targetUserId, ownedCount: newIds.length });
  } else {
    // For managers: update allowed_project_ids
    db.prepare('UPDATE users SET allowed_project_ids = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(newIds), now, targetUserId);
    logConsole('info', 'Manager projects updated', { targetUserId, count: newIds.length });
  }

  return res.json({ success: true, message: 'Projects updated' });
}));

module.exports = router;
