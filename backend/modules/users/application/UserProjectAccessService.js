const AccessPolicy = require('../../access/domain/AccessPolicy');
const { createUserProjectAccessRepository } = require('../infrastructure/UserProjectAccessRepository');

function createUserProjectAccessService(db) {
  const repository = createUserProjectAccessRepository(db);

  return {
    updateUserProjects(requestingUser, targetUserId, projectIds) {
      const targetUser = repository.getUserById(targetUserId);
      if (!targetUser) {
        throwHttpError(404, 'NOT_FOUND', 'User not found');
      }

      assertCanManageTarget(requestingUser, targetUser);

      const requestedProjectIds = normalizeProjectIds(projectIds);
      const assignableProjectIds = new Set(getAssignableProjectIds(repository, requestingUser, targetUser));
      const safeProjectIds = requestedProjectIds.filter(projectId => assignableProjectIds.has(projectId));
      const now = Math.floor(Date.now() / 1000);
      repository.updateAllowedProjectIds(targetUserId, safeProjectIds, now);

      return {
        targetUser,
        projectIds: safeProjectIds,
        updatedAt: now
      };
    }
  };
}

function getAssignableProjectIds(repository, requestingUser, targetUser) {
  if (AccessPolicy.isSuperAdmin(requestingUser)) {
    if (targetUser.role === 'admin') {
      return repository.getProjectIdsByOwner(requestingUser.userId);
    }

    if (targetUser.role === 'manager') {
      return getAdminVisibleProjectIds(repository, targetUser.admin_id);
    }
  }

  if (AccessPolicy.isAdmin(requestingUser) && targetUser.role === 'manager') {
    return getAdminVisibleProjectIds(repository, requestingUser.userId);
  }

  return [];
}

function getAdminVisibleProjectIds(repository, adminId) {
  if (!adminId) return [];

  const ownedProjectIds = repository.getProjectIdsByOwner(adminId);
  const allowedProjectIds = AccessPolicy.parseAllowedProjectIds(repository.getAllowedProjectIds(adminId)) || [];
  const existingAllowedProjectIds = repository.getExistingProjectIds(allowedProjectIds);

  return Array.from(new Set([...ownedProjectIds, ...existingAllowedProjectIds]));
}

function normalizeProjectIds(projectIds) {
  if (!Array.isArray(projectIds)) return [];
  return Array.from(new Set(projectIds.map(String).filter(Boolean)));
}

function assertCanManageTarget(requestingUser, targetUser) {
  if (AccessPolicy.isSuperAdmin(requestingUser)) {
    if (targetUser.role === 'super_admin') {
      throwHttpError(403, 'FORBIDDEN', 'Cannot update super admin projects');
    }
    return;
  }

  if (AccessPolicy.isAdmin(requestingUser)) {
    if (targetUser.role === 'manager' && targetUser.admin_id === requestingUser.userId) {
      return;
    }

    throwHttpError(403, 'FORBIDDEN', 'Access denied');
  }

  throwHttpError(403, 'FORBIDDEN', 'Insufficient permissions');
}

function throwHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

module.exports = {
  createUserProjectAccessService
};
