/**
 * Centralized error response handler
 */
const sendError = (res, statusCode, message, details = null) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(details && { details }),
    },
  });
};

/**
 * Centralized success response handler
 */
const sendSuccess = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    ...(data && { data }),
  });
};

module.exports = {
  sendError,
  sendSuccess,
};
