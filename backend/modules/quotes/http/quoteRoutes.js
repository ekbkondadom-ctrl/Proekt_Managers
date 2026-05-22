const express = require('express');

const { anyRole } = require('../../../middleware/rbac');
const { asyncHandler } = require('../../../middleware/errorHandler');
const { logAction, logConsole } = require('../../../utils/logger');
const { createQuoteService } = require('../application/QuoteService');

const router = express.Router();

router.get('/', anyRole, asyncHandler(async (req, res) => {
  const service = createQuoteService(req.db);
  const quotes = service.listQuotes(req.user, req.query);

  return res.json({
    success: true,
    quotes,
    pagination: {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0,
      count: quotes.length
    }
  });
}));

router.post('/', anyRole, asyncHandler(async (req, res) => {
  const service = createQuoteService(req.db);
  const quote = service.createQuote(req.user, req.body);

  logAction(req.db, {
    userId: req.user.userId,
    userRole: req.user.role,
    action: 'quote_created',
    description: `Created quote for project ${quote.projectId}`,
    targetType: 'quote',
    targetId: quote.id,
    ipAddress: req.ipAddress
  });

  logConsole('info', 'Quote created', {
    quoteId: quote.id,
    projectId: quote.projectId,
    createdBy: req.user.userId
  });

  return res.status(201).json({
    success: true,
    quote
  });
}));

router.get('/:id', anyRole, asyncHandler(async (req, res) => {
  const service = createQuoteService(req.db);
  const quote = service.getQuote(req.user, req.params.id);

  return res.json({
    success: true,
    quote
  });
}));

module.exports = router;
