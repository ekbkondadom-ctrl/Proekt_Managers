/**
 * routes/projects.js
 * 
 * Маршруты для управления проектами с изоляцией по админам
 * - GET /api/projects - Получить проекты текущего админа
 * - POST /api/projects - Создать проект
 * - GET /api/projects/:id - Получить проект (с проверкой доступа)
 * - PUT /api/projects/:id - Обновить проект
 * - DELETE /api/projects/:id - Удалить проект
 */

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');

const { adminOrSuperAdmin, anyRole } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/errorHandler');
const { logAction, logConsole } = require('../utils/logger');

/**
 * GET /api/projects
 * Получить список проектов
 * 
 * Админ получает только свои проекты
 * Менеджер получает проекты своего админа
 * Супер-админ может получить все проекты (query параметр adminId=<id>)
 */
router.get('/', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const { adminId, limit = 50, offset = 0 } = req.query;

  try {
    let query = 'SELECT * FROM projects WHERE 1=1';
    const params = [];

    // Фильтруем по админу в зависимости от роли
    if (user.role === 'super_admin' && adminId) {
      // Супер-админ может смотреть проекты конкретного админа
      query += ' AND owner_admin_id = ?';
      params.push(adminId);
    } else if (user.role === 'admin') {
      const userRow = db.prepare('SELECT allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(user.userId);
      const allowedIds = userRow?.allowed_project_ids ? JSON.parse(userRow.allowed_project_ids) : null;
      if (allowedIds && allowedIds.length > 0) {
        const placeholders = allowedIds.map(() => '?').join(',');
        query += ` AND owner_admin_id = ? AND id IN (${placeholders})`;
        params.push(user.userId, ...allowedIds);
      } else {
        query += ' AND owner_admin_id = ?';
        params.push(user.userId);
      }
    } else if (user.role === 'manager') {
      const userRow = db.prepare('SELECT allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(user.userId);
      const allowedIds = userRow?.allowed_project_ids ? JSON.parse(userRow.allowed_project_ids) : null;
      if (allowedIds && allowedIds.length > 0) {
        const placeholders = allowedIds.map(() => '?').join(',');
        query += ` AND owner_admin_id = ? AND id IN (${placeholders})`;
        params.push(user.adminId, ...allowedIds);
      } else {
        query += ' AND owner_admin_id = ?';
        params.push(user.adminId);
      }
    }

    query += ' ORDER BY updated_at DESC';
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const stmt = db.prepare(query);
    const projects = stmt.all(...params);

    // Парсим JSON поля
    const parsedProjects = projects.map(p => ({
      ...p,
      images: tryParseJSON(p.images),
      planImages: tryParseJSON(p.plan_images),
      specs: tryParseJSON(p.specs),
      configData: tryParseJSON(p.config_data),
      selections: tryParseJSON(p.selections),
      multiSel: tryParseJSON(p.multi_sel)
    }));

    logConsole('debug', 'Projects list retrieved', {
      userId: user.userId,
      role: user.role,
      count: projects.length
    });

    return res.json({
      success: true,
      projects: parsedProjects,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: parsedProjects.length
      }
    });

  } catch (err) {
    logConsole('error', 'Get projects error', { error: err.message });
    throw err;
  }
}));

/**
 * POST /api/projects
 * Создать проект
 */
router.post('/', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const ipAddress = req.ipAddress;
  const { name, code, client, date, images, planImages, specs, configData, selections, multiSel } = req.body;

  // Определяем owner_admin_id
  let ownerAdminId;
  if (user.role === 'super_admin') {
    // Супер-админ может создавать от имени кого-то (если указано)
    ownerAdminId = req.body.ownerAdminId || user.userId;
  } else if (user.role === 'admin') {
    // Админ создает свой проект
    ownerAdminId = user.userId;
  } else if (user.role === 'manager') {
    // Менеджер создает для своего админа
    ownerAdminId = user.adminId;
  } else {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
      code: 'FORBIDDEN'
    });
  }

  try {
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required',
        code: 'MISSING_NAME'
      });
    }

    const projectId = uuid();
    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO projects (
        id, owner_admin_id, name, code, client, date,
        images, plan_images, specs, config_data,
        selections, multi_sel, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      projectId,
      ownerAdminId,
      name,
      code || null,
      client || null,
      date || null,
      JSON.stringify(images || []),
      JSON.stringify(planImages || []),
      JSON.stringify(specs || []),
      JSON.stringify(configData || []),
      JSON.stringify(selections || {}),
      JSON.stringify(multiSel || {}),
      now,
      now
    );

    // Логируем создание
    logAction(db, {
      userId: user.userId,
      userRole: user.role,
      action: 'project_created',
      description: `Created project: ${name}`,
      targetType: 'project',
      targetId: projectId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Project created', {
      projectId,
      name,
      ownerAdminId
    });

    return res.status(201).json({
      success: true,
      project: {
        id: projectId,
        ownerAdminId: ownerAdminId,
        name: name,
        code: code || null,
        client: client || null,
        date: date || null,
        images: images || [],
        planImages: planImages || [],
        specs: specs || [],
        configData: configData || [],
        selections: selections || {},
        multiSel: multiSel || {},
        createdAt: now,
        updatedAt: now
      }
    });

  } catch (err) {
    logConsole('error', 'Create project error', { error: err.message });
    throw err;
  }
}));

/**
 * GET /api/projects/:id
 * Получить проект (с проверкой доступа)
 */
router.get('/:id', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const projectId = req.params.id;

  try {
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1');
    const project = stmt.get(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // Проверяем доступ
    if (user.role === 'admin' && project.owner_admin_id !== user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    if (user.role === 'manager' && project.owner_admin_id !== user.adminId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    // Парсим JSON
    const result = {
      ...project,
      images: tryParseJSON(project.images),
      planImages: tryParseJSON(project.plan_images),
      specs: tryParseJSON(project.specs),
      configData: tryParseJSON(project.config_data),
      selections: tryParseJSON(project.selections),
      multiSel: tryParseJSON(project.multi_sel)
    };

    return res.json({
      success: true,
      project: result
    });

  } catch (err) {
    logConsole('error', 'Get project error', { error: err.message });
    throw err;
  }
}));

/**
 * PUT /api/projects/:id
 * Обновить проект
 */
router.put('/:id', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const projectId = req.params.id;
  const ipAddress = req.ipAddress;
  const { name, code, client, date, images, planImages, specs, configData, selections, multiSel } = req.body;

  try {
    // Получаем проект
    const getStmt = db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1');
    const project = getStmt.get(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // Проверяем доступ
    if (user.role === 'admin' && project.owner_admin_id !== user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    if (user.role === 'manager' && project.owner_admin_id !== user.adminId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    // Обновляем проект
    const now = Math.floor(Date.now() / 1000);
    const updateStmt = db.prepare(`
      UPDATE projects SET
        name = ?, code = ?, client = ?, date = ?,
        images = ?, plan_images = ?, specs = ?, config_data = ?,
        selections = ?, multi_sel = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      name !== undefined ? name : project.name,
      code !== undefined ? code : project.code,
      client !== undefined ? client : project.client,
      date !== undefined ? date : project.date,
      images !== undefined ? JSON.stringify(images) : project.images,
      planImages !== undefined ? JSON.stringify(planImages) : project.plan_images,
      specs !== undefined ? JSON.stringify(specs) : project.specs,
      configData !== undefined ? JSON.stringify(configData) : project.config_data,
      selections !== undefined ? JSON.stringify(selections) : project.selections,
      multiSel !== undefined ? JSON.stringify(multiSel) : project.multi_sel,
      now,
      projectId
    );

    // Логируем обновление
    logAction(db, {
      userId: user.userId,
      userRole: user.role,
      action: 'project_updated',
      description: `Updated project: ${project.name}`,
      targetType: 'project',
      targetId: projectId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Project updated', { projectId });

    return res.json({
      success: true,
      message: 'Project updated successfully'
    });

  } catch (err) {
    logConsole('error', 'Update project error', { error: err.message });
    throw err;
  }
}));

/**
 * DELETE /api/projects/:id
 * Удалить проект
 */
router.delete('/:id', anyRole, asyncHandler(async (req, res) => {
  const db = req.db;
  const user = req.user;
  const projectId = req.params.id;
  const ipAddress = req.ipAddress;

  try {
    // Получаем проект
    const getStmt = db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1');
    const project = getStmt.get(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
    }

    // Проверяем доступ
    if (user.role === 'admin' && project.owner_admin_id !== user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    if (user.role === 'manager' && project.owner_admin_id !== user.adminId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'FORBIDDEN'
      });
    }

    // Удаляем проект
    const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');
    deleteStmt.run(projectId);

    // Логируем удаление
    logAction(db, {
      userId: user.userId,
      userRole: user.role,
      action: 'project_deleted',
      description: `Deleted project: ${project.name}`,
      targetType: 'project',
      targetId: projectId,
      ipAddress: ipAddress
    });

    logConsole('info', 'Project deleted', { projectId });

    return res.json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (err) {
    logConsole('error', 'Delete project error', { error: err.message });
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
