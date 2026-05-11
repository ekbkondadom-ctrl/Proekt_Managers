/**
 * middleware/errorHandler.js
 * 
 * Глобальная обработка ошибок для Express
 */

const { logConsole } = require('../utils/logger');

/**
 * Middleware: обработка ошибок
 * Логирует ошибки и возвращает стандартный формат ответа
 */
function errorHandler(err, req, res, next) {
  // Логируем ошибку
  logConsole('error', 'Application error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId
  });

  // Определяем статус код
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';

  // Обработка известных ошибок
  if (err.message.includes('UNIQUE constraint failed')) {
    statusCode = 409;
    errorCode = 'CONFLICT';
    message = 'Resource already exists';
  }

  if (err.message.includes('FOREIGN KEY constraint failed')) {
    statusCode = 400;
    errorCode = 'INVALID_REFERENCE';
    message = 'Invalid reference to related resource';
  }

  // Не отправляем детали ошибок в production
  if (process.env.NODE_ENV === 'production') {
    if (statusCode === 500) {
      message = 'Internal server error';
    }
  }

  // Отправляем ответ
  return res.status(statusCode).json({
    success: false,
    error: message,
    code: errorCode,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { details: err.message })
  });
}

/**
 * Middleware: обработка 404 ошибок
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method
  });
}

/**
 * Wrapper для асинхронных обработчиков (catch ошибки)
 * @param {Function} fn - Асинхронная функция
 * @returns {Function} Express middleware
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
