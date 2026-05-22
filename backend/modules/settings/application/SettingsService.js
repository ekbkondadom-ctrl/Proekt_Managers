const { v4: uuid } = require('uuid');
const AccessPolicy = require('../../access/domain/AccessPolicy');
const { createSettingsRepository } = require('../infrastructure/SettingsRepository');

function createSettingsService(db) {
  const repository = createSettingsRepository(db);

  return {
    listSettings(user, query = {}) {
      assertCanManageSettings(user);
      const ownerAdminId = AccessPolicy.resolveSettingsOwner(user, query.adminId);
      const rows = repository.list(ownerAdminId);
      const settings = {};

      rows.forEach(row => {
        settings[row.setting_key] = parseJSON(row.setting_value, row.setting_value);
      });

      return {
        ownerAdminId,
        settings,
        count: rows.length
      };
    },

    updateSettings(user, payload = {}) {
      assertCanManageSettings(user);
      const ownerAdminId = AccessPolicy.resolveSettingsOwner(user, payload.adminId);
      const settingsToUpdate = normalizeSettingsPayload(payload);
      const now = Math.floor(Date.now() / 1000);
      let updated = 0;

      for (const [key, value] of Object.entries(settingsToUpdate)) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        repository.upsert(ownerAdminId, key, serialized, now, uuid());
        updated++;
      }

      return {
        ownerAdminId,
        updated
      };
    },

    getSetting(user, key) {
      assertCanManageSettings(user);
      const ownerAdminId = AccessPolicy.resolveSettingsOwner(user);
      const row = repository.get(ownerAdminId, key);

      if (!row) {
        throwHttpError(404, 'SETTING_NOT_FOUND', 'Setting not found');
      }

      return {
        key,
        value: parseJSON(row.setting_value, row.setting_value)
      };
    },

    deleteSetting(user, key) {
      assertCanManageSettings(user);
      const ownerAdminId = AccessPolicy.resolveSettingsOwner(user);
      const existing = repository.get(ownerAdminId, key);

      if (!existing) {
        throwHttpError(404, 'SETTING_NOT_FOUND', 'Setting not found');
      }

      const result = repository.delete(ownerAdminId, key);

      if (result.changes === 0 && repository.get(ownerAdminId, key)) {
        throwHttpError(404, 'SETTING_NOT_FOUND', 'Setting not found');
      }

      return {
        ownerAdminId,
        key
      };
    }
  };
}

function assertCanManageSettings(user) {
  if (!AccessPolicy.canManageSettings(user)) {
    throwHttpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
}

function normalizeSettingsPayload(payload) {
  if (payload.key && payload.value !== undefined) {
    return { [payload.key]: payload.value };
  }

  if (payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings)) {
    return payload.settings;
  }

  throwHttpError(400, 'INVALID_FORMAT', 'Invalid request format');
}

function parseJSON(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function throwHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

module.exports = {
  createSettingsService
};
