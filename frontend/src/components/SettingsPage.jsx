import React, { useState } from 'react';
import { Lock, CreditCard, X } from 'lucide-react';
import '../styles/SettingsPage.css';

const SettingsPage = ({ onClose, user }) => {
  const [activeModal, setActiveModal] = useState(null);

  const closeModal = () => {
    setActiveModal(null);
  };

  return (
    <div className="settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h1>Settings</h1>
          <button
            className="settings-modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="settings-modal-content">
          <div className="settings-section">
            <h2 className="settings-section-title">Account & Legal</h2>
            
            <button
              className="settings-option"
              onClick={() => setActiveModal('privacy')}
              type="button"
            >
              <div className="settings-option-icon">
                <Lock size={20} />
              </div>
              <div className="settings-option-content">
                <h3>Privacy Policy</h3>
                <p>View our privacy terms and data usage policy</p>
              </div>
              <span className="settings-option-arrow">›</span>
            </button>

            <button
              className="settings-option"
              onClick={() => setActiveModal('subscription')}
              type="button"
            >
              <div className="settings-option-icon">
                <CreditCard size={20} />
              </div>
              <div className="settings-option-content">
                <h3>Subscription</h3>
                <p>Manage your subscription and billing</p>
              </div>
              <span className="settings-option-arrow">›</span>
            </button>
          </div>
        </div>

        {/* Privacy Policy Modal */}
        {activeModal === 'privacy' && (
          <div className="nested-modal-backdrop" onClick={closeModal}>
            <div className="nested-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Privacy Policy</h2>
                <button
                  className="modal-close"
                  onClick={closeModal}
                  type="button"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {/* Content will be added later */}
              </div>
            </div>
          </div>
        )}

        {/* Subscription Modal */}
        {activeModal === 'subscription' && (
          <div className="nested-modal-backdrop" onClick={closeModal}>
            <div className="nested-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Subscription</h2>
                <button
                  className="modal-close"
                  onClick={closeModal}
                  type="button"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {/* Content will be added later */}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
