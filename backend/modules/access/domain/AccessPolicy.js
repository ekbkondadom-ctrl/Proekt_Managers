const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager'
});

function isSuperAdmin(user) {
  return user?.role === ROLES.SUPER_ADMIN;
}

function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

function isManager(user) {
  return user?.role === ROLES.MANAGER;
}

function parseAllowedProjectIds(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map(String).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : null;
  } catch (error) {
    return null;
  }
}

function hasProjectId(projectIds, projectId) {
  return Array.isArray(projectIds) && projectIds.includes(String(projectId));
}

function canManageSettings(user) {
  return isSuperAdmin(user) || isAdmin(user);
}

function canCreateProjectCard(user) {
  return isSuperAdmin(user) || isAdmin(user);
}

function canEditProjectCard(user, project) {
  if (!user || !project) return false;
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return project.owner_admin_id === user.userId;
  return false;
}

function canSaveProjectWorkingState(user, project, allowedProjectIds) {
  return isManager(user) && canViewProject(user, project, allowedProjectIds);
}

function canViewProject(user, project, allowedProjectIds = null) {
  if (!user || !project) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdmin(user)) {
    return project.owner_admin_id === user.userId ||
      hasProjectId(allowedProjectIds, project.id);
  }

  if (isManager(user)) {
    if (Array.isArray(allowedProjectIds)) {
      return hasProjectId(allowedProjectIds, project.id);
    }

    return project.owner_admin_id === user.adminId;
  }

  return false;
}

function resolveProjectOwnerForCreate(user, requestedOwnerAdminId) {
  if (isSuperAdmin(user)) {
    return requestedOwnerAdminId || user.userId;
  }

  if (isAdmin(user)) {
    return user.userId;
  }

  return null;
}

function resolveSettingsOwner(user, requestedAdminId) {
  if (isSuperAdmin(user)) {
    return requestedAdminId || user.userId;
  }

  if (isAdmin(user)) {
    return user.userId;
  }

  return null;
}

function buildVisibleProjectsScope(user, allowedProjectIds, requestedAdminId) {
  if (isSuperAdmin(user)) {
    return requestedAdminId
      ? { where: ' AND owner_admin_id = ?', params: [requestedAdminId] }
      : { where: '', params: [] };
  }

  if (isAdmin(user)) {
    if (Array.isArray(allowedProjectIds) && allowedProjectIds.length > 0) {
      const placeholders = allowedProjectIds.map(() => '?').join(',');
      return {
        where: ` AND (owner_admin_id = ? OR id IN (${placeholders}))`,
        params: [user.userId, ...allowedProjectIds]
      };
    }

    return { where: ' AND owner_admin_id = ?', params: [user.userId] };
  }

  if (isManager(user)) {
    if (Array.isArray(allowedProjectIds)) {
      if (allowedProjectIds.length === 0) {
        return { where: ' AND 1 = 0', params: [] };
      }

      const placeholders = allowedProjectIds.map(() => '?').join(',');
      return { where: ` AND id IN (${placeholders})`, params: allowedProjectIds };
    }

    return { where: ' AND owner_admin_id = ?', params: [user.adminId] };
  }

  return { where: ' AND 1 = 0', params: [] };
}

module.exports = {
  ROLES,
  isSuperAdmin,
  isAdmin,
  isManager,
  parseAllowedProjectIds,
  canManageSettings,
  canCreateProjectCard,
  canEditProjectCard,
  canSaveProjectWorkingState,
  canViewProject,
  resolveProjectOwnerForCreate,
  resolveSettingsOwner,
  buildVisibleProjectsScope
};
