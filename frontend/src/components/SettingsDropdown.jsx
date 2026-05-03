import React, { useState, useRef, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import '../styles/SettingsDropdown.css';

const SettingsDropdown = ({ user = {}, onProfile, onSettings, onHelp, onLogout }) => {
  const HelpIcon = LucideIcons.HelpCircle || LucideIcons.CircleHelp;
  const UserIcon = LucideIcons.User;
  const SettingsIcon = LucideIcons.Settings;
  const LogoutIcon = LucideIcons.LogOut;

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const userName = user.name || 'User Name';
  const userEmail = user.email || 'user@example.com';
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const closeDropdown = () => {
    setIsOpen(false);
  };

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (callback) => {
    if (typeof callback === 'function') {
      callback();
    }
    closeDropdown();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        closeDropdown();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const firstItem = menuRef.current?.querySelector('[role="menuitem"]');
    firstItem?.focus();
  }, [isOpen]);

  const handleMenuKeyDown = (event) => {
    const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
    if (!items || items.length === 0) return;
    const currentIndex = Array.from(items).indexOf(document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    }

    if (event.key === 'Tab') {
      if (currentIndex === items.length - 1 && !event.shiftKey) {
        event.preventDefault();
        items[0]?.focus();
      }
      if (currentIndex === 0 && event.shiftKey) {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (document.activeElement?.getAttribute('role') === 'menuitem') {
        event.preventDefault();
        document.activeElement.click();
      }
    }
  };

  return (
    <div className="settings-dropdown-wrapper">
      <button
        ref={triggerRef}
        type="button"
        className="settings-avatar-button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        {user.picture ? (
          <img src={user.picture} alt={userName} className="settings-avatar-image" />
        ) : (
          <span className="settings-avatar-text">{initials}</span>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="settings-dropdown-menu"
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="settings-dropdown-user">
            <div className="settings-dropdown-avatar">
              {user.picture ? (
                <img src={user.picture} alt={userName} className="settings-dropdown-avatar-image" />
              ) : (
                initials
              )}
            </div>
            <div className="settings-dropdown-user-info">
              <div className="settings-dropdown-name">{userName}</div>
              <div className="settings-dropdown-email">{userEmail}</div>
            </div>
          </div>

          <div className="settings-dropdown-divider" />

          <button
            type="button"
            className="settings-dropdown-item"
            role="menuitem"
            onClick={() => handleSelect(onProfile)}
          >
            <span className="settings-dropdown-icon" aria-hidden="true">
              <UserIcon size={16} />
            </span>
            <span>My Profile</span>
          </button>

          <button
            type="button"
            className="settings-dropdown-item"
            role="menuitem"
            onClick={() => handleSelect(onSettings)}
          >
            <span className="settings-dropdown-icon" aria-hidden="true">
              <SettingsIcon size={16} />
            </span>
            <span>Settings</span>
          </button>

          <button
            type="button"
            className="settings-dropdown-item"
            role="menuitem"
            onClick={() => handleSelect(onHelp)}
          >
            <span className="settings-dropdown-icon" aria-hidden="true">
              <HelpIcon size={16} />
            </span>
            <span>Help / Support</span>
          </button>

          <div className="settings-dropdown-divider" />

          <button
            type="button"
            className="settings-dropdown-item settings-dropdown-item-logout"
            role="menuitem"
            onClick={() => handleSelect(onLogout)}
          >
            <span className="settings-dropdown-icon" aria-hidden="true">
              <LogoutIcon size={16} />
            </span>
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsDropdown;
