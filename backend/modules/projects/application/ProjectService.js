const { v4: uuid } = require('uuid');
const AccessPolicy = require('../../access/domain/AccessPolicy');
const { createProjectRepository } = require('../infrastructure/ProjectRepository');

function createProjectService(db) {
  const repository = createProjectRepository(db);

  return {
    listProjects(user, query = {}) {
      const pagination = {
        limit: clampInt(query.limit, 50, 1, 100),
        offset: clampInt(query.offset, 0, 0, 100000)
      };
      const allowedProjectIds = AccessPolicy.parseAllowedProjectIds(repository.getAllowedProjectIds(user.userId));
      const scope = AccessPolicy.buildVisibleProjectsScope(user, allowedProjectIds, query.adminId);
      const projects = repository.list(scope, pagination).map(mapProjectRow);

      return {
        projects,
        pagination: {
          ...pagination,
          count: projects.length
        }
      };
    },

    createProject(user, payload = {}) {
      if (!AccessPolicy.canCreateProjectCard(user)) {
        throwHttpError(403, 'FORBIDDEN', 'Insufficient permissions');
      }

      if (!payload.name) {
        throwHttpError(400, 'MISSING_NAME', 'Project name is required');
      }

      const now = Math.floor(Date.now() / 1000);
      const ownerAdminId = AccessPolicy.resolveProjectOwnerForCreate(user, payload.ownerAdminId);
      const project = {
        id: uuid(),
        ownerAdminId,
        name: payload.name,
        code: payload.code || null,
        client: payload.client || null,
        date: payload.date || null,
        images: payload.images || [],
        planImages: payload.planImages || [],
        specs: payload.specs || [],
        configData: payload.configData || [],
        selections: payload.selections || {},
        multiSel: payload.multiSel || {},
        createdAt: now,
        updatedAt: now
      };

      repository.create(project);
      return project;
    },

    getProject(user, projectId) {
      const project = repository.getById(projectId);
      if (!project) {
        throwHttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      assertCanViewProject(repository, user, project);
      return mapProjectRow(project);
    },

    updateProject(user, projectId, payload = {}) {
      const project = repository.getById(projectId);
      if (!project) {
        throwHttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      const access = repository.getUserAccess(user.userId);
      const userWithAccess = {
        ...user,
        permissions: tryParseJSON(access?.permissions, null)
      };
      const allowedProjectIds = AccessPolicy.parseAllowedProjectIds(access?.allowed_project_ids);
      const canEditCard = AccessPolicy.canEditProjectCard(userWithAccess, project);
      let patch = payload;

      if (!canEditCard) {
        const managerPatch = buildManagerProjectPatch(userWithAccess, project, payload);
        const canSaveWorkingState = AccessPolicy.canSaveProjectWorkingState(userWithAccess, project, allowedProjectIds);

        if (!canSaveWorkingState || managerPatch.forbiddenFields.length > 0 || Object.keys(managerPatch.patch).length === 0) {
          throwHttpError(403, 'FORBIDDEN', 'Access denied');
        }

        patch = managerPatch.patch;
      }

      const updatedProject = repository.update(projectId, project, patch, Math.floor(Date.now() / 1000));

      return {
        projectId,
        previousName: project.name,
        project: mapProjectRow(updatedProject)
      };
    },

    deleteProject(user, projectId) {
      const project = repository.getById(projectId);
      if (!project) {
        throwHttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
      }

      if (!AccessPolicy.canEditProjectCard(user, project)) {
        throwHttpError(403, 'FORBIDDEN', 'Access denied');
      }

      repository.delete(projectId);
      return {
        projectId,
        previousName: project.name
      };
    }
  };
}

function assertCanViewProject(repository, user, project) {
  const allowedProjectIds = AccessPolicy.parseAllowedProjectIds(repository.getAllowedProjectIds(user.userId));
  if (!AccessPolicy.canViewProject(user, project, allowedProjectIds)) {
    throwHttpError(403, 'FORBIDDEN', 'Access denied');
  }
}

function mapProjectRow(project) {
  return {
    ...project,
    images: tryParseJSON(project.images, []),
    planImages: tryParseJSON(project.plan_images, []),
    specs: tryParseJSON(project.specs, []),
    configData: tryParseJSON(project.config_data, []),
    selections: tryParseJSON(project.selections, {}),
    multiSel: tryParseJSON(project.multi_sel, {})
  };
}

function buildManagerProjectPatch(user, project, body = {}) {
  const allowedFields = new Set(['client', 'date', 'selections', 'multiSel']);

  if (hasExplicitProjectPermission(user, 'editProject')) {
    ['name', 'code', 'client', 'date'].forEach(field => allowedFields.add(field));
  }

  if (hasExplicitProjectPermission(user, 'editPhotos')) {
    ['images', 'planImages'].forEach(field => allowedFields.add(field));
  }

  if (hasExplicitProjectPermission(user, 'editSpecs')) {
    allowedFields.add('specs');
  }

  if (hasExplicitProjectPermission(user, 'editEstimate')) {
    ['configData', 'selections', 'multiSel'].forEach(field => allowedFields.add(field));
  }

  const knownFields = ['name', 'code', 'client', 'date', 'images', 'planImages', 'specs', 'configData', 'selections', 'multiSel'];
  const patch = {};
  const forbiddenFields = [];

  for (const field of knownFields) {
    if (body[field] === undefined) continue;

    if (allowedFields.has(field)) {
      patch[field] = body[field];
      continue;
    }

    if (!projectFieldEquals(project, field, body[field])) {
      forbiddenFields.push(field);
    }
  }

  return { patch, forbiddenFields };
}

function hasExplicitProjectPermission(user, permission) {
  if (AccessPolicy.isSuperAdmin(user) || AccessPolicy.isAdmin(user)) return true;
  return user?.permissions?.[permission] === true;
}

function projectFieldEquals(project, field, nextValue) {
  const currentValue = getProjectFieldValue(project, field);

  if (Array.isArray(currentValue) || isPlainObject(currentValue)) {
    return JSON.stringify(nextValue || (Array.isArray(currentValue) ? [] : {})) === JSON.stringify(currentValue);
  }

  return normalizeText(nextValue) === normalizeText(currentValue);
}

function getProjectFieldValue(project, field) {
  switch (field) {
    case 'images':
      return tryParseJSON(project.images, []);
    case 'planImages':
      return tryParseJSON(project.plan_images, []);
    case 'specs':
      return tryParseJSON(project.specs, []);
    case 'configData':
      return tryParseJSON(project.config_data, []);
    case 'selections':
      return tryParseJSON(project.selections, {});
    case 'multiSel':
      return tryParseJSON(project.multi_sel, {});
    default:
      return project[field] || '';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function tryParseJSON(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeText(value) {
  return value === null || value === undefined ? '' : String(value);
}

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function throwHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

module.exports = {
  createProjectService,
  mapProjectRow
};
