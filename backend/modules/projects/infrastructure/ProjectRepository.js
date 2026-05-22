function createProjectRepository(db) {
  return {
    getAllowedProjectIds(userId) {
      const row = db.prepare('SELECT allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(userId);
      return row?.allowed_project_ids || null;
    },

    getUserAccess(userId) {
      return db.prepare('SELECT permissions, allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(userId);
    },

    list(scope, pagination) {
      let query = 'SELECT * FROM projects WHERE 1=1';
      const params = [];

      if (scope?.where) {
        query += scope.where;
        params.push(...(scope.params || []));
      }

      query += ' ORDER BY updated_at DESC';
      query += ' LIMIT ? OFFSET ?';
      params.push(pagination.limit, pagination.offset);

      return db.prepare(query).all(...params);
    },

    getById(projectId) {
      return db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(projectId);
    },

    create(project) {
      db.prepare(`
        INSERT INTO projects (
          id, owner_admin_id, name, code, client, date,
          images, plan_images, specs, config_data,
          selections, multi_sel, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.id,
        project.ownerAdminId,
        project.name,
        project.code || null,
        project.client || null,
        project.date || null,
        JSON.stringify(project.images || []),
        JSON.stringify(project.planImages || []),
        JSON.stringify(project.specs || []),
        JSON.stringify(project.configData || []),
        JSON.stringify(project.selections || {}),
        JSON.stringify(project.multiSel || {}),
        project.createdAt,
        project.updatedAt
      );

      return this.getById(project.id);
    },

    update(projectId, currentProject, patch, updatedAt) {
      db.prepare(`
        UPDATE projects SET
          name = ?, code = ?, client = ?, date = ?,
          images = ?, plan_images = ?, specs = ?, config_data = ?,
          selections = ?, multi_sel = ?, updated_at = ?
        WHERE id = ?
      `).run(
        patch.name !== undefined ? patch.name : currentProject.name,
        patch.code !== undefined ? patch.code : currentProject.code,
        patch.client !== undefined ? patch.client : currentProject.client,
        patch.date !== undefined ? patch.date : currentProject.date,
        patch.images !== undefined ? JSON.stringify(patch.images) : currentProject.images,
        patch.planImages !== undefined ? JSON.stringify(patch.planImages) : currentProject.plan_images,
        patch.specs !== undefined ? JSON.stringify(patch.specs) : currentProject.specs,
        patch.configData !== undefined ? JSON.stringify(patch.configData) : currentProject.config_data,
        patch.selections !== undefined ? JSON.stringify(patch.selections) : currentProject.selections,
        patch.multiSel !== undefined ? JSON.stringify(patch.multiSel) : currentProject.multi_sel,
        updatedAt,
        projectId
      );

      return this.getById(projectId);
    },

    delete(projectId) {
      return db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    }
  };
}

module.exports = {
  createProjectRepository
};
