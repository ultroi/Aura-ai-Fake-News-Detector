const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

/**
 * Send OTP via email
 */
const sendOTPEmail = async (email, otp) => {
  try {
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { color: #333; margin: 0; }
            .content { text-align: center; margin: 30px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
            .warning { background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 20px 0; color: #856404; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Aura AI</h1>
              <p>Email Verification</p>
            </div>
            
            <div class="content">
              <p>Use the code below to verify your email address:</p>
              <div class="otp-code">${otp}</div>
              <p style="color: #666;">This code will expire in 5 minutes.</p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> Never share this code with anyone. Aura AI support will never ask for your verification code.
            </div>
            
            <div class="footer">
              <p>If you didn't request this code, please ignore this email.</p>
              <p>&copy; 2026 Aura AI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your Aura AI Verification Code',
      html: htmlTemplate,
      text: `Your verification code is: ${otp}. This code will expire in 5 minutes.`,
    });

    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }
};

/**
 * Send verification success email
 */
const sendVerificationSuccessEmail = async (email) => {
  try {
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { color: #333; margin: 0; }
            .success { color: #28a745; font-size: 18px; font-weight: bold; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Aura AI</h1>
              <p>Account Verified</p>
            </div>
            
            <div class="content">
              <p class="success">✓ Your email has been successfully verified!</p>
              <p>You can now access all features of Aura AI.</p>
              <p>If you have any questions, please contact our support team.</p>
            </div>
            
            <div class="footer">
              <p>&copy; 2026 Aura AI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Email Verified Successfully - Aura AI',
      html: htmlTemplate,
      text: 'Your email has been successfully verified!',
    });

    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send email');
  }
};

/**
 * Send support request to Aura support inbox
 */
const sendSupportRequestEmail = async ({ type, name, email, subject, message, userId, source = 'web-app', attachment = null }) => {
  try {
    const supportInbox = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;

    if (!supportInbox) {
      throw new Error('Support inbox is not configured');
    }

    const safeType = escapeHtml(type || 'general');
    const safeName = escapeHtml(name || 'Anonymous');
    const safeEmail = escapeHtml(email || 'not-provided');
    const safeSubject = escapeHtml(subject || 'Support Request');
    const safeMessage = escapeHtml(message || '').replace(/\n/g, '<br />');
    const safeUserId = escapeHtml(userId || 'not-available');
    const safeSource = escapeHtml(source);

    const attachmentMeta = attachment && typeof attachment === 'object' ? attachment : null;
    const attachmentName = attachmentMeta?.name ? String(attachmentMeta.name) : null;
    const attachmentType = attachmentMeta?.type ? String(attachmentMeta.type) : null;
    const attachmentDataUrl = attachmentMeta?.dataUrl ? String(attachmentMeta.dataUrl) : null;

    let mailAttachments = [];
    let attachmentPreview = '';

    const normalizedDataUrl = attachmentDataUrl ? String(attachmentDataUrl).replace(/\s+/g, '') : null;

    if (attachmentName && attachmentType && normalizedDataUrl && normalizedDataUrl.startsWith('data:')) {
      const match = normalizedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const base64Content = match[2];
        mailAttachments = [
          {
            filename: attachmentName,
            content: Buffer.from(base64Content, 'base64'),
            contentType: attachmentType,
            contentDisposition: 'attachment',
          },
        ];

        if (attachmentType.startsWith('image/')) {
          attachmentPreview = `
            <div class="attachment-box">
              <p class="label">Attachment Preview:</p>
              <img src="${normalizedDataUrl}" alt="Attached media preview" class="attachment-preview" />
            </div>
          `;
        } else {
          attachmentPreview = `
            <div class="attachment-box">
              <p class="label">Attachment:</p>
              <p>${escapeHtml(attachmentName)} (${escapeHtml(attachmentType)})</p>
            </div>
          `;
        }
      }
    }

    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
            .container { max-width: 720px; margin: 20px auto; background-color: #ffffff; padding: 24px; border-radius: 10px; }
            .title { margin: 0 0 16px; color: #111827; }
            .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 0.04em; }
            .meta { margin-top: 16px; }
            .meta-row { margin: 6px 0; color: #374151; }
            .label { font-weight: bold; color: #111827; }
            .message-box { margin-top: 18px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #111827; line-height: 1.55; }
            .attachment-box { margin-top: 18px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #111827; }
            .attachment-preview { display: block; margin-top: 10px; max-width: 100%; border-radius: 8px; }
            .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="title">New Aura AI Support Request</h2>
            <span class="badge">${safeType}</span>

            <div class="meta">
              <div class="meta-row"><span class="label">Subject:</span> ${safeSubject}</div>
              <div class="meta-row"><span class="label">Name:</span> ${safeName}</div>
              <div class="meta-row"><span class="label">Email:</span> ${safeEmail}</div>
              <div class="meta-row"><span class="label">User ID:</span> ${safeUserId}</div>
              <div class="meta-row"><span class="label">Source:</span> ${safeSource}</div>
            </div>

            <div class="message-box">${safeMessage}</div>
            ${attachmentPreview}

            <div class="footer">
              <p>This message was submitted from Aura AI Help &amp; Support form.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: supportInbox,
      replyTo: email || undefined,
      subject: `[Aura Support] ${type || 'General'} - ${subject || 'Support Request'}`,
      html: htmlTemplate,
      text: `New support request\nType: ${type}\nSubject: ${subject}\nName: ${name}\nEmail: ${email}\nUser ID: ${userId || 'not-available'}\nSource: ${source}\n\nMessage:\n${message}`,
      attachments: mailAttachments,
    });

    return { success: true };
  } catch (error) {
    console.error('Support email sending error:', error);
    throw new Error('Failed to send support email');
  }
};

module.exports = {
  sendOTPEmail,
  sendVerificationSuccessEmail,
  sendSupportRequestEmail,
};
