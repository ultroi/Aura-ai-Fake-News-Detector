const SupportRequest = require('../models/SupportRequest');
const { sendSupportEmail } = require('../utils/email');
const { success, failure } = require('../utils/response');

const submitSupportRequest = async (req, res) => {
  const { type, name, email, subject, message, attachment = null } = req.body;
  const request = await SupportRequest.create({
    user: req.userId || null,
    type: String(type).trim().toLowerCase(),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    subject: String(subject).trim(),
    message: String(message).trim(),
    attachment: attachment ? {
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    } : null,
  });

  try {
    await sendSupportEmail({ type, name, email, subject, message, attachment });
  } catch (error) {
    console.warn('[support] Email delivery failed; ticket remains stored:', error.message);
  }

  return success(res, 200, 'Support request sent successfully', { id: request._id });
};

module.exports = { submitSupportRequest };
