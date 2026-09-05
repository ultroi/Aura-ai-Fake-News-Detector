import React, { useEffect, useState } from 'react';
import { X, Minus, Save, User } from 'lucide-react';
import '../styles/ProfileModal.css';

function ProfileModal({ visible, onClose, onSave, user = null }) {
  const safeUser = user || {};
  const [name, setName] = useState(safeUser.name || '');
  const [username, setUsername] = useState(safeUser.username || '');
  const [photo, setPhoto] = useState(safeUser.picture || '');
  const [isMinimized, setIsMinimized] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (visible && user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setPhoto(user.picture || '');
      setStatus('');
      setIsMinimized(false);
    }
  }, [visible, user?.name, user?.username, user?.picture, user]);

  const handleSave = () => {
    onSave({
      ...user,
      name: name.trim() || user.name || 'User Name',
      username: username.trim() || user.username || '',
      picture: photo || user.picture || '',
    });
    setStatus('Profile saved successfully');
    window.setTimeout(() => setStatus(''), 2500);
  };

  const handleToggleMinimize = () => {
    setIsMinimized((prev) => !prev);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setPhoto(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhoto('');
  };

  const handleClose = () => {
    setIsMinimized(false);
    onClose();
  };

  if (!visible) return null;

  if (isMinimized) {
    return (
      <div className="profile-minimized-bar" role="dialog" aria-label="Profile minimized">
        <div className="profile-minimized-content">
          <span className="profile-minimized-indicator">
            <User size={16} /> Profile minimized
          </span>
          <div className="profile-minimized-actions">
            <button type="button" className="restore-button" onClick={handleToggleMinimize}>
              Restore
            </button>
            <button type="button" className="close-button" onClick={handleClose} aria-label="Close profile">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-modal-backdrop" onClick={handleClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <div className="profile-modal-title">Edit Profile</div>
            <div className="profile-modal-subtitle">Update your display name and username</div>
          </div>
          <div className="profile-modal-controls">
            <button type="button" className="icon-button" onClick={handleToggleMinimize} aria-label="Minimize">
              <Minus size={16} />
            </button>
            <button type="button" className="icon-button" onClick={handleClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="profile-modal-body">
          <div className="profile-avatar-preview">
            <div className="profile-avatar-circle profile-avatar-photo">
              {photo ? (
                <img src={photo} alt="Profile preview" />
              ) : (
                (user.name || 'U')
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              )}
            </div>
            <div>
              <div className="profile-avatar-label">{user.name || 'User Name'}</div>
              <div className="profile-photo-actions">
                <input
                  id="profile-photo-input"
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={handlePhotoChange}
                />
                <label htmlFor="profile-photo-input" className="photo-upload-button">
                  Change photo
                </label>
                {photo && (
                  <button type="button" className="photo-remove-button" onClick={handleRemovePhoto}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="profile-field-group">
            <label htmlFor="profile-name">Display name</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your display name"
            />
          </div>

          <div className="profile-field-group">
            <label htmlFor="profile-username">Username</label>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
            />
          </div>

          <div className="profile-modal-actions">
            <button type="button" className="profile-save-button" onClick={handleSave}>
              <Save size={16} /> Save profile
            </button>
            <button type="button" className="profile-close-button" onClick={handleClose}>
              Cancel
            </button>
          </div>

          {status && <div className="profile-status-message">{status}</div>}
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;
