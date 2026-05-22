const express = require('express');

const { anyRole } = require('../../../middleware/rbac');
const { asyncHandler } = require('../../../middleware/errorHandler');
const { logAction, logConsole } = require('../../../utils/logger');
const { createSettingsService } = require('../application/SettingsService');

const router = express.Router();

router.get('/', anyRole, asyncHandler(async (req, res) => {
  const service = createSettingsService(req.db);
  const result = service.listSettings(req.user, req.query);

  logConsole('debug', 'Settings retrieved', {
    userId: req.user.userId,
    targetAdminId: result.ownerAdminId,
    count: result.count
  });

  return res.json({
    success: true,
    settings: result.settings
  });
}));

router.put('/', anyRole, asyncHandler(async (req, res) => {
  const service = createSettingsService(req.db);
  const result = service.updateSettings(req.user, req.body);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'settings_updated',
    description: `Updated ${result.updated} setting(s)`,
    targetType: 'settings',
    targetId: result.ownerAdminId,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Settings updated', {
    userId: req.user.userId,
    ownerAdminId: result.ownerAdminId,
    count: result.updated
  });

  return res.json({
    success: true,
    message: `${result.updated} setting(s) updated successfully`,
    updated: result.updated
  });
}));

router.get('/:key', anyRole, asyncHandler(async (req, res) => {
  const service = createSettingsService(req.db);
  const result = service.getSetting(req.user, req.params.key);

  return res.json({
    success: true,
    key: result.key,
    value: result.value
  });
}));

router.delete('/:key', anyRole, asyncHandler(async (req, res) => {
  const service = createSettingsService(req.db);
  const result = service.deleteSetting(req.user, req.params.key);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'setting_deleted',
    description: `Deleted setting: ${result.key}`,
    targetType: 'settings',
    targetId: result.ownerAdminId,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Setting deleted', { settingKey: result.key });

  return res.json({
    success: true,
    message: 'Setting deleted successfully'
  });
}));

module.exports = router;
