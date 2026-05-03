import React from 'react';
import SettingsDropdown from './SettingsDropdown';
import '../styles/DashboardPage.css';

const DashboardPage = ({ onTryAura, onOpenAuth, user, authenticated, onProfile, onSettings, onHelp, onLogout }) => {
  return (
    <div className="dashboard-screen">
      <div className="dashboard-topbar">
        <div className="dashboard-actions">
          {!authenticated ? (
            <>
              <button className="dashboard-link" type="button" onClick={onTryAura}>
                Try Aura
              </button>
              <button className="dashboard-button dashboard-button-secondary" type="button" onClick={() => onOpenAuth('signup')}>
                Login / Sign Up
              </button>
            </>
          ) : (
            <SettingsDropdown
              user={user}
              onProfile={onProfile}
              onSettings={onSettings}
              onHelp={onHelp}
              onLogout={onLogout}
            />
          )}
        </div>
      </div>

      <div className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-badge">Your AI-Powered Research Assistant</span>
          <h1>
            {authenticated && user?.name ? `Welcome back, ${user.name}` : 'Welcome to'} <span>Aura AI</span>
          </h1>
          <p>Instantly verify claims. Research faster. Chat smarter.</p>
          <div className="dashboard-hero-actions">
            {authenticated ? (
              <button className="dashboard-hero-cta" type="button" onClick={onTryAura}>
                Start Chat
              </button>
            ) : (
              <>
                <button className="dashboard-hero-cta" type="button" onClick={onTryAura}>
                  Try Aura Chat
                </button>
                <button className="dashboard-hero-secondary" type="button" onClick={() => onOpenAuth('signup')}>
                  Login / Sign Up
                </button>
              </>
            )}
          </div>
        </div>

        <div className="dashboard-hero-visual">
          <div className="dashboard-hero-ring">
            <img src="/aura_ai.png" alt="Aura AI logo" className="dashboard-hero-image" />
            <div className="dashboard-hero-glow" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
