function createQuoteRepository(db) {
  return {
    getAllowedProjectIds(userId) {
      const row = db.prepare('SELECT allowed_project_ids FROM users WHERE id = ? LIMIT 1').get(userId);
      return row?.allowed_project_ids || null;
    },

    getProjectById(projectId) {
      return db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(projectId);
    },

    create(quote) {
      db.prepare(`
        INSERT INTO quotes (
          id, project_id, project_owner_admin_id, owner_admin_id, created_by,
          client, quote_date, status, selections, multi_sel, discount, vat,
          totals, snapshot, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        quote.id,
        quote.projectId,
        quote.projectOwnerAdminId,
        quote.ownerAdminId,
        quote.createdBy,
        quote.client || null,
        quote.quoteDate || null,
        quote.status || 'draft',
        JSON.stringify(quote.selections || {}),
        JSON.stringify(quote.multiSel || {}),
        JSON.stringify(quote.discount || null),
        JSON.stringify(quote.vat || null),
        JSON.stringify(quote.totals || {}),
        JSON.stringify(quote.snapshot || {}),
        quote.createdAt,
        quote.updatedAt
      );

      return this.getById(quote.id);
    },

    getById(id) {
      return db.prepare('SELECT * FROM quotes WHERE id = ? LIMIT 1').get(id);
    },

    list(filters = {}) {
      let query = 'SELECT * FROM quotes WHERE 1=1';
      const params = [];

      if (filters.projectId) {
        query += ' AND project_id = ?';
        params.push(filters.projectId);
      }

      if (filters.ownerAdminId) {
        query += ' AND owner_admin_id = ?';
        params.push(filters.ownerAdminId);
      }

      if (filters.createdBy) {
        query += ' AND created_by = ?';
        params.push(filters.createdBy);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(filters.limit || 50, filters.offset || 0);

      return db.prepare(query).all(...params);
    }
  };
}

module.exports = {
  createQuoteRepository
};
