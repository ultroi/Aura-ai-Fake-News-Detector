import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import '../styles/AuthPage.css';
import apiClient from '../services/authService';

const AuthPage = ({ onContinue, onBack }) => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('email');

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

  const handleSendOTP = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await apiClient.sendOTP(email);
      console.log('OTP sent:', response);
      setStep('otp');
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to send OTP');
      console.error('Send OTP error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      setError('Please enter the OTP');
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError('OTP must be 6 digits');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await apiClient.verifyOTP(email, otp);
      console.log('OTP verified:', response);
      onContinue(response.data.user);
    } catch (err) {
      setError(err.message || 'OTP verification failed');
      console.error('Verify OTP error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtp('');
    setError('');
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

        {step === 'email' ? (
          <>
            <div className="google-login-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                locale="en"
              />
            </div>

            <div className="auth-divider">
              <span>or verify email</span>
            </div>

            <div className="auth-form">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="auth-input"
                placeholder="Enter you email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
              />
              {error && <span className="auth-error">{error}</span>}

              <button
                className="auth-button-email"
                onClick={handleSendOTP}
                disabled={loading}
              >
                {loading ? 'Sending OTP...' : 'Continue with Email'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-form">
              <label htmlFor="otp">Enter OTP</label>
              <p className="auth-otp-info">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
              <input
                id="otp"
                type="text"
                className="auth-input"
                placeholder="000000"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (error) setError('');
                }}
                disabled={loading}
                maxLength="6"
              />
              {error && <span className="auth-error">{error}</span>}

              <button
                className="auth-button-email"
                onClick={handleVerifyOTP}
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <button
                className="auth-button-back"
                onClick={handleBackToEmail}
                disabled={loading}
              >
                Back to Email
              </button>
            </div>
          </>
        )}

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