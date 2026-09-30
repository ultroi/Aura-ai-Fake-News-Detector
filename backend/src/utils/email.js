const nodemailer = require('nodemailer');
const { env } = require('../config/env');

let transporter = null;
if (env.emailHost && env.emailUser && env.emailPassword) {
  transporter = nodemailer.createTransport({
    host: env.emailHost,
    port: env.emailPort,
    secure: env.emailSecure,
    auth: { user: env.emailUser, pass: env.emailPassword },
  });
}

const sendSupportEmail = async ({ type, name, email, subject, message, attachment }) => {
  if (!transporter || !env.supportEmail) return false;

  const attachments = [];
  if (attachment?.dataUrl && attachment?.name) {
    attachments.push({
      filename: attachment.name,
      path: attachment.dataUrl,
      contentType: attachment.type || undefined,
    });
  }

  await transporter.sendMail({
    from: env.emailUser,
    to: env.supportEmail,
    replyTo: email,
    subject: `[Aura AI ${type}] ${subject}`,
    text: `Name: ${name}\nEmail: ${email}\nType: ${type}\n\n${message}`,
    attachments,
  });
  return true;
};

module.exports = { sendSupportEmail };
