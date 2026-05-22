const express = require('express');

const { anyRole } = require('../../../middleware/rbac');
const { asyncHandler } = require('../../../middleware/errorHandler');
const { logAction, logConsole } = require('../../../utils/logger');
const { createProjectService } = require('../application/ProjectService');

const router = express.Router();

router.get('/', anyRole, asyncHandler(async (req, res) => {
  const service = createProjectService(req.db);
  const result = service.listProjects(req.user, req.query);

  logConsole('debug', 'Projects list retrieved', {
    userId: req.user.userId,
    role: req.user.role,
    count: result.projects.length
  });

  return res.json({
    success: true,
    projects: result.projects,
    pagination: result.pagination
  });
}));

router.post('/', anyRole, asyncHandler(async (req, res) => {
  const service = createProjectService(req.db);
  const project = service.createProject(req.user, req.body);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'project_created',
    description: `Created project: ${project.name}`,
    targetType: 'project',
    targetId: project.id,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Project created', {
    projectId: project.id,
    name: project.name,
    ownerAdminId: project.ownerAdminId
  });

  return res.status(201).json({
    success: true,
    project
  });
}));

router.get('/:id', anyRole, asyncHandler(async (req, res) => {
  const service = createProjectService(req.db);
  const project = service.getProject(req.user, req.params.id);

  return res.json({
    success: true,
    project
  });
}));

router.put('/:id', anyRole, asyncHandler(async (req, res) => {
  const service = createProjectService(req.db);
  const result = service.updateProject(req.user, req.params.id, req.body);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'project_updated',
    description: `Updated project: ${result.previousName}`,
    targetType: 'project',
    targetId: result.projectId,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Project updated', { projectId: result.projectId });

  return res.json({
    success: true,
    message: 'Project updated successfully',
    project: result.project
  });
}));

router.delete('/:id', anyRole, asyncHandler(async (req, res) => {
  const service = createProjectService(req.db);
  const result = service.deleteProject(req.user, req.params.id);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'project_deleted',
    description: `Deleted project: ${result.previousName}`,
    targetType: 'project',
    targetId: result.projectId,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Project deleted', { projectId: result.projectId });

  return res.json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

module.exports = router;
