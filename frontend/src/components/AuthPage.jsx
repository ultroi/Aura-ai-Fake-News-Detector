import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import '../styles/AuthPage.css';
import apiClient from '../services/authService';

const AuthPage = ({ onContinue, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google OAuth controls
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const frontendOrigin = currentOrigin || import.meta.env.VITE_FRONTEND_URL || '';
  const enableGoogleEnv = import.meta.env.VITE_ENABLE_GOOGLE !== 'false';
  const localOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:5173',
  ]);
  const allowGoogle = enableGoogleEnv && googleClientId && (!currentOrigin || currentOrigin === frontendOrigin || localOrigins.has(currentOrigin));

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');

    try {
      if (!credentialResponse.credential) {
        throw new Error('No credential received from Google');
      }

      const response = await apiClient.googleLogin(credentialResponse.credential);
      onContinue(response.data.user);
    } catch (err) {
      setError(err.message || 'Google login failed');
      console.error('Google login error:', err);
    }
  };

  const handleGoogleError = () => {
    setError('Google login failed. Please try again.');
    console.error('Google login error');
  };

  const handleEmailPasswordLogin = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await apiClient.emailPasswordLogin(email, password);
      onContinue(response.data.user);
    } catch (err) {
      setError(err.message || 'Email/password login failed');
      console.error('Email/password login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-content">
        {onBack && (
          <button className="auth-back-top" type="button" onClick={onBack}>
            Back
          </button>
        )}
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/aura_ai.png" alt="Aura AI" width="80" height="80" />
          </div>
          <div className="auth-copy">
            <h1>Welcome</h1>
            <p>Sign in to continue to your AI workspace</p>
          </div>
        </div>

        <div className="google-login-wrapper">
          {allowGoogle ? (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={(err) => {
                console.error('Google login error:', err);
                setError('Google sign-in failed. Check Google Cloud Console authorized origins.');
                handleGoogleError();
              }}
              locale="en"
            />
          ) : (
            <div style={{ color: '#999', fontSize: '13px', textAlign: 'center' }}>
              <p style={{ margin: 0 }}>Google sign-in is currently disabled for this origin.</p>
              <p style={{ margin: '6px 0 0' }}>
                To enable, either set <strong>VITE_ENABLE_GOOGLE=true</strong> in <code>.env</code> and
                add <strong>{frontendOrigin}</strong> as an Authorized JavaScript origin in your Google Cloud Console.
              </p>
              <p style={{ marginTop: 8 }}>
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud Credentials</a>
              </p>
            </div>
          )}
        </div>

        <div className="auth-divider">
          <span>or use email and password</span>
        </div>

        <div className="auth-form">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            className="auth-input"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            disabled={loading}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="auth-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            disabled={loading}
          />

          {error && <span className="auth-error">{error}</span>}

          <button
            className="auth-button-email"
            onClick={handleEmailPasswordLogin}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Continue with Email'}
          </button>
        </div>

        <p className="auth-legal">
          By continuing, you agree to our{' '}
          <a href="#">Terms of Service</a> and{' '}
          <a href="#">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
};

export default AuthPage;