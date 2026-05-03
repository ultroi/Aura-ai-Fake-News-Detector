import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bug, CheckCircle2, FileImage, Lightbulb, X } from 'lucide-react';
import apiClient from '../services/authService';
import '../styles/SupportPage.css';

const SUPPORT_TYPES = [
  { value: 'bug', label: 'Bug Report', icon: Bug },
  { value: 'error', label: 'Error Report', icon: AlertTriangle },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb },
];

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read attachment'));
    reader.readAsDataURL(file);
  });

const SupportPage = ({ user, onBack }) => {
  const [form, setForm] = useState({
    type: 'bug',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });
  const [attachment, setAttachment] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  const selectedType = useMemo(
    () => SUPPORT_TYPES.find((item) => item.value === form.type) || SUPPORT_TYPES[0],
    [form.type]
  );

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearAttachment = () => {
    setAttachment(null);
  };

  const closeSuccessPopup = () => {
    setShowSuccessPopup(false);
  };

  useEffect(() => {
    if (!showSuccessPopup) return undefined;

    const timer = window.setTimeout(() => {
      setShowSuccessPopup(false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [showSuccessPopup]);

  const handleAttachmentChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setFeedback({
        type: 'error',
        message: 'Attachment is too large. Please keep media under 5MB.',
      });
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      });
      setFeedback({ type: '', message: '' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Could not attach the selected media.',
      });
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.subject.trim() || !form.message.trim()) {
      setFeedback({ type: 'error', message: 'Please fill in all required fields.' });
      return;
    }

    const supportName = user?.name?.trim() || 'Anonymous';
    const supportEmail = user?.email?.trim() || 'not-provided';

    setIsSubmitting(true);
    setFeedback({ type: '', message: '' });

    try {
      await apiClient.submitSupportRequest({
        type: form.type,
        name: supportName,
        email: supportEmail,
        subject: form.subject.trim(),
        message: form.message.trim(),
        attachment: attachment
          ? {
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              dataUrl: attachment.dataUrl,
            }
          : null,
      });

      setFeedback({
        type: 'success',
        message: 'Message sent to Aura official support email successfully.',
      });
      setShowSuccessPopup(true);

      setForm((prev) => ({
        ...prev,
        subject: '',
        message: '',
      }));
      clearAttachment();
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Failed to send your request. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const SelectedIcon = selectedType.icon;

  return (
    <div className="support-screen">
      {showSuccessPopup ? (
        <div className="support-popup-overlay" role="dialog" aria-modal="true" aria-label="Support request sent successfully">
          <div className="support-popup-card">
            <button type="button" className="support-popup-close" onClick={closeSuccessPopup} aria-label="Close success popup">
              <X size={16} />
            </button>
            <div className="support-popup-icon">
              <CheckCircle2 size={22} />
            </div>
            <h2>Sent successfully</h2>
            <p>Your support message has been delivered to the official Aura inbox.</p>
          </div>
        </div>
      ) : null}

      <div className="support-shell">
        <div className="support-topbar">
          <button type="button" className="support-back-button" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>

        <div className="support-hero">
          <span className="support-badge">Help & Support</span>
          <h1>Need help with something?</h1>
          <p>Send a bug report, error report, or suggestion. Keep it short, clear, and we’ll take it from there.</p>
        </div>

        <div className="support-layout">
          <aside className="support-info-panel">
            <div className="support-info-card">
              <h2>Quick help</h2>
              <ul className="support-info-list">
                <li>Bug reports</li>
                <li>Unexpected errors</li>
                <li>Feature ideas</li>
                <li>Account or flow issues</li>
              </ul>
            </div>

            <div className="support-info-card support-info-card-muted">
              <h2>Best results</h2>
              <p>Include what you were doing, what you expected, and any error text or screenshots.</p>
            </div>

            <div className="support-info-card support-info-card-muted">
              <h2>Status</h2>
              <p>Messages are sent directly to Aura official support email.</p>
            </div>
          </aside>

          <section className="support-card">
            <form className="support-form" onSubmit={handleSubmit}>
              <div className="support-form-head">
                <div>
                  <p className="support-form-label">Message</p>
                  <h2>Tell us what happened</h2>
                </div>
                <div className="support-selected-type">
                  <SelectedIcon size={16} />
                  <span>{selectedType.label}</span>
                </div>
              </div>

              <div className="support-type-grid" role="radiogroup" aria-label="Support request type">
                {SUPPORT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={`support-type-option ${form.type === value ? 'active' : ''}`}
                    onClick={() => updateField('type', value)}
                    aria-pressed={form.type === value}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <label className="support-field">
                <span>Subject</span>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => updateField('subject', e.target.value)}
                  placeholder="Short summary"
                  maxLength={140}
                  required
                />
              </label>

              <label className="support-field">
                <span>Details</span>
                <textarea
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  placeholder="Describe the issue, error, or suggestion"
                  rows={7}
                  maxLength={4000}
                  required
                />
              </label>

              <div className="support-compose-bar">
                <div className="support-compose-main">
                  <div className="support-attachment-inline">
                    <label className="support-attachment-button">
                      <FileImage size={16} />
                      <span>Attach media</span>
                      <input
                        type="file"
                        accept="image/*,video/*,audio/*"
                        onChange={handleAttachmentChange}
                        className="support-attachment-input"
                      />
                    </label>

                    <span className="support-attachment-help">Screenshots, images, video, or audio up to 5MB.</span>
                  </div>

                  {attachment ? (
                    <div className="support-attachment-chip">
                      <div className="support-attachment-meta">
                        <span className="support-attachment-name">{attachment.name}</span>
                        <span className="support-attachment-size">
                          {(attachment.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                      <button
                        type="button"
                        className="support-attachment-remove"
                        onClick={clearAttachment}
                        aria-label="Remove attachment"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="support-compose-footer">
                  <span className="support-char-count">{form.message.length}/4000</span>
                  <button type="submit" className="support-submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send message'}
                  </button>
                </div>
              </div>

              {feedback.message ? (
                <div className={`support-feedback ${feedback.type}`}>{feedback.message}</div>
              ) : null}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
