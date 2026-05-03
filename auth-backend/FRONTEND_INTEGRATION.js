// Frontend Integration Examples for Aura AI Auth Backend

// ======================== GOOGLE OAUTH ========================

// 1. Setup Google Sign-In in your HTML
/*
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleGoogleLogin">
</div>
<div class="g_id_signin" data-type="standard"></div>
*/

// 2. Handle Google Login Callback
async function handleGoogleLogin(response) {
  try {
    const googleToken = response.credential;

    // Send to backend
    const res = await fetch('http://localhost:5000/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ token: googleToken }),
    });

    const data = await res.json();

    if (data.success) {
      console.log('Google login successful!', data.data.user);
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } else {
      console.error('Login failed:', data.error.message);
      alert('Login failed: ' + data.error.message);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred during login');
  }
}

// ======================== EMAIL OTP FLOW ========================

// 1. Send OTP
async function sendOTP(email) {
  try {
    const res = await fetch('http://localhost:5000/auth/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (data.success) {
      console.log('OTP sent! Check your email');
      return { success: true, message: data.message };
    } else {
      console.error('Failed to send OTP:', data.error.message);
      return { success: false, message: data.error.message };
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    return { success: false, message: 'Network error' };
  }
}

// 2. Verify OTP
async function verifyOTP(email, otp) {
  try {
    const res = await fetch('http://localhost:5000/auth/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Cookies are automatically sent/received
      body: JSON.stringify({ email, otp }),
    });

    const data = await res.json();

    if (data.success) {
      console.log('OTP verified! Logged in as:', data.data.user.email);
      // JWT is now in httpOnly cookie, redirect to dashboard
      window.location.href = '/dashboard';
      return { success: true };
    } else {
      console.error('OTP verification failed:', data.error.message);
      return { success: false, message: data.error.message };
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return { success: false, message: 'Network error' };
  }
}

// ======================== PROTECTED ROUTES ========================

// Get current user (protected route)
async function getCurrentUser() {
  try {
    const res = await fetch('http://localhost:5000/auth/me', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies automatically
    });

    if (res.status === 401) {
      console.log('Not authenticated, redirecting to login');
      window.location.href = '/login';
      return null;
    }

    const data = await res.json();

    if (data.success) {
      return data.data.user;
    } else {
      console.error('Failed to fetch user:', data.error.message);
      return null;
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

// ======================== LOGOUT ========================

async function logout() {
  try {
    const res = await fetch('http://localhost:5000/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await res.json();

    if (data.success) {
      console.log('Logout successful');
      // Redirect to login
      window.location.href = '/login';
    } else {
      console.error('Logout failed:', data.error.message);
    }
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

// ======================== REACT EXAMPLE ========================

/*
import React, { useState } from 'react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await sendOTP(email);
    if (result.success) {
      setStep('otp');
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await verifyOTP(email, otp);
    if (!result.success) {
      setError(result.message);
    }
    // If success, page redirects automatically
    setLoading(false);
  };

  return (
    <div className="login-container">
      {error && <div className="error">{error}</div>}

      {step === 'email' ? (
        <form onSubmit={handleSendOTP}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOTP}>
          <input
            type="text"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength="6"
            pattern="\d{6}"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
          <button type="button" onClick={() => setStep('email')}>
            Back
          </button>
        </form>
      )}

      <GoogleSignInButton />
    </div>
  );
};

export default LoginPage;
*/

// ======================== VUE 3 EXAMPLE ========================

/*
<template>
  <div class="login">
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="step === 'email'">
      <form @submit.prevent="sendOTP">
        <input
          v-model="email"
          type="email"
          placeholder="Enter your email"
          required
        />
        <button :disabled="loading">
          {{ loading ? 'Sending...' : 'Send OTP' }}
        </button>
      </form>
    </div>

    <div v-else>
      <form @submit.prevent="verifyOTP">
        <input
          v-model="otp"
          type="text"
          placeholder="Enter 6-digit OTP"
          maxlength="6"
          pattern="\d{6}"
          required
        />
        <button :disabled="loading">
          {{ loading ? 'Verifying...' : 'Verify OTP' }}
        </button>
        <button @click="step = 'email'">Back</button>
      </form>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  setup() {
    const email = ref('');
    const otp = ref('');
    const step = ref('email');
    const loading = ref(false);
    const error = ref('');

    const sendOTP = async () => {
      loading.value = true;
      error.value = '';
      const result = await sendOTP(email.value);
      if (result.success) {
        step.value = 'otp';
      } else {
        error.value = result.message;
      }
      loading.value = false;
    };

    const verifyOTP = async () => {
      loading.value = true;
      error.value = '';
      const result = await verifyOTP(email.value, otp.value);
      if (!result.success) {
        error.value = result.message;
      }
      loading.value = false;
    };

    return {
      email,
      otp,
      step,
      loading,
      error,
      sendOTP,
      verifyOTP,
    };
  },
};
</script>
*/

// ======================== AXIOS INTERCEPTOR EXAMPLE ========================

/*
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:5000',
  withCredentials: true, // Important: send cookies with requests
});

// Response interceptor to handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Use in your app
export default apiClient;

// Usage:
// apiClient.post('/auth/send-otp', { email });
// apiClient.post('/auth/verify-otp', { email, otp });
// apiClient.get('/auth/me');
*/

export {
  handleGoogleLogin,
  sendOTP,
  verifyOTP,
  getCurrentUser,
  logout,
};
