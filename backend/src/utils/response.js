const success = (res, status, message, data = {}) => {
  return res.status(status).json({ success: true, message, ...data });
};

const failure = (res, status, message, details = undefined) => {
  const payload = { success: false, error: { message } };
  if (details !== undefined) payload.error.details = details;
  return res.status(status).json(payload);
};

module.exports = { success, failure };
