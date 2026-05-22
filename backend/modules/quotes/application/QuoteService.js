const { v4: uuid } = require('uuid');
const AccessPolicy = require('../../access/domain/AccessPolicy');
const { calculateQuote } = require('../domain/QuoteCalculator');
const { createQuoteRepository } = require('../infrastructure/QuoteRepository');

function createQuoteService(db) {
  const repository = createQuoteRepository(db);

  return {
    createQuote(user, payload = {}) {
      const projectId = payload.projectId;
      if (!projectId) {
        const err = new Error('projectId is required');
        err.statusCode = 400;
        err.code = 'MISSING_PROJECT_ID';
        throw err;
      }

      const project = repository.getProjectById(projectId);
      if (!project) {
        const err = new Error('Project not found');
        err.statusCode = 404;
        err.code = 'PROJECT_NOT_FOUND';
        throw err;
      }

      const allowedProjectIds = AccessPolicy.parseAllowedProjectIds(repository.getAllowedProjectIds(user.userId));
      if (!AccessPolicy.canViewProject(user, project, allowedProjectIds)) {
        const err = new Error('Access denied');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      const normalizedProject = normalizeProject(project);
      const selections = asObject(payload.selections || normalizedProject.selections);
      const multiSel = asObject(payload.multiSel || normalizedProject.multiSel);
      const calculation = calculateQuote({
        project: normalizedProject,
        selections,
        multiSel,
        discount: payload.discount,
        vat: payload.vat
      });

      const now = Math.floor(Date.now() / 1000);
      const quote = {
        id: uuid(),
        projectId: project.id,
        projectOwnerAdminId: project.owner_admin_id,
        ownerAdminId: resolveQuoteOwnerAdminId(user, project, payload.ownerAdminId),
        createdBy: user.userId,
        client: resolveClient(payload, normalizedProject),
        quoteDate: payload.quoteDate || new Date().toISOString().slice(0, 10),
        status: payload.status || 'draft',
        selections,
        multiSel,
        discount: payload.discount || null,
        vat: payload.vat || null,
        totals: calculation.totals,
        snapshot: buildSnapshot(normalizedProject, calculation.sections),
        createdAt: now,
        updatedAt: now
      };

      return parseQuote(repository.create(quote));
    },

    listQuotes(user, filters = {}) {
      const scopedFilters = {
        projectId: filters.projectId || null,
        limit: clampInt(filters.limit, 50, 1, 100),
        offset: clampInt(filters.offset, 0, 0, 100000)
      };

      if (AccessPolicy.isAdmin(user)) {
        scopedFilters.ownerAdminId = user.userId;
      } else if (AccessPolicy.isManager(user)) {
        scopedFilters.createdBy = user.userId;
      }

      return repository.list(scopedFilters).map(parseQuote);
    },

    getQuote(user, quoteId) {
      const quote = repository.getById(quoteId);
      if (!quote) {
        const err = new Error('Quote not found');
        err.statusCode = 404;
        err.code = 'QUOTE_NOT_FOUND';
        throw err;
      }

      if (!canViewQuote(user, quote)) {
        const err = new Error('Access denied');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      return parseQuote(quote);
    }
  };
}

function resolveQuoteOwnerAdminId(user, project, requestedOwnerAdminId) {
  if (AccessPolicy.isSuperAdmin(user)) {
    return requestedOwnerAdminId || project.owner_admin_id || user.userId;
  }

  if (AccessPolicy.isAdmin(user)) {
    return user.userId;
  }

  return user.adminId;
}

function resolveClient(payload, project) {
  if (typeof payload.client === 'string' && payload.client.trim()) {
    return payload.client.trim();
  }

  if (payload.discount && typeof payload.discount.client === 'string' && payload.discount.client.trim()) {
    return payload.discount.client.trim();
  }

  return project.client || '';
}

function canViewQuote(user, quote) {
  if (AccessPolicy.isSuperAdmin(user)) return true;
  if (AccessPolicy.isAdmin(user)) return quote.owner_admin_id === user.userId;
  if (AccessPolicy.isManager(user)) return quote.created_by === user.userId;
  return false;
}

function normalizeProject(project) {
  return {
    id: project.id,
    ownerAdminId: project.owner_admin_id,
    name: project.name || 'Project',
    code: project.code || '',
    client: project.client || '',
    specs: parseJSON(project.specs, []),
    configData: parseJSON(project.config_data, []),
    selections: parseJSON(project.selections, {}),
    multiSel: parseJSON(project.multi_sel, {})
  };
}

function buildSnapshot(project, sections) {
  return {
    project: {
      id: project.id,
      ownerAdminId: project.ownerAdminId,
      name: project.name,
      code: project.code,
      specs: project.specs
    },
    sections
  };
}

function parseQuote(row) {
  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    projectOwnerAdminId: row.project_owner_admin_id,
    ownerAdminId: row.owner_admin_id,
    createdBy: row.created_by,
    client: row.client,
    quoteDate: row.quote_date,
    status: row.status,
    selections: parseJSON(row.selections, {}),
    multiSel: parseJSON(row.multi_sel, {}),
    discount: parseJSON(row.discount, null),
    vat: parseJSON(row.vat, null),
    totals: parseJSON(row.totals, {}),
    snapshot: parseJSON(row.snapshot, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

module.exports = {
  createQuoteService
};
