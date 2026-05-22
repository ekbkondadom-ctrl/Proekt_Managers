function createUserProjectAccessRepository(db) {
  return {
    getUserById(userId) {
      return db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(userId);
    },

    getExistingProjectIds(projectIds) {
      if (!Array.isArray(projectIds) || projectIds.length === 0) return [];

      const uniqueIds = Array.from(new Set(projectIds.map(String).filter(Boolean)));
      if (!uniqueIds.length) return [];

      const placeholders = uniqueIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id FROM projects WHERE id IN (${placeholders})`).all(...uniqueIds);
      const existingIds = new Set(rows.map(row => row.id));
      return uniqueIds.filter(id => existingIds.has(id));
    },

    getProjectIdsByOwner(ownerAdminId) {
      if (!ownerAdminId) return [];
      return db.prepare('SELECT id FROM projects WHERE owner_admin_id = ?').all(ownerAdminId)
        .map(row => row.id);
    },

    getAllowedProjectIds(userId) {
      if (!userId) return null;
      const row = db.prepare('SELECT allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(userId);
      return row?.allowed_project_ids || null;
    },

    updateAllowedProjectIds(userId, projectIds, updatedAt) {
      return db.prepare('UPDATE users SET allowed_project_ids = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(projectIds), updatedAt, userId);
    }
  };
}

module.exports = {
  createUserProjectAccessRepository
};
