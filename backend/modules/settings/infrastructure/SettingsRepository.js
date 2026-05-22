function createSettingsRepository(db) {
  return {
    list(ownerAdminId) {
      return db.prepare(`
        SELECT setting_key, setting_value FROM settings
        WHERE owner_admin_id = ?
        ORDER BY setting_key
      `).all(ownerAdminId);
    },

    get(ownerAdminId, key) {
      return db.prepare(`
        SELECT setting_value FROM settings
        WHERE owner_admin_id = ? AND setting_key = ?
        LIMIT 1
      `).get(ownerAdminId, key);
    },

    upsert(ownerAdminId, key, value, now, settingId) {
      const existing = db.prepare(`
        SELECT id FROM settings WHERE owner_admin_id = ? AND setting_key = ? LIMIT 1
      `).get(ownerAdminId, key);

      if (existing) {
        return db.prepare(`
          UPDATE settings SET setting_value = ?, updated_at = ?
          WHERE owner_admin_id = ? AND setting_key = ?
        `).run(value, now, ownerAdminId, key);
      }

      return db.prepare(`
        INSERT INTO settings (id, owner_admin_id, setting_key, setting_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(settingId, ownerAdminId, key, value, now, now);
    },

    delete(ownerAdminId, key) {
      return db.prepare(`
        DELETE FROM settings
        WHERE owner_admin_id = ? AND setting_key = ?
      `).run(ownerAdminId, key);
    }
  };
}

module.exports = {
  createSettingsRepository
};
