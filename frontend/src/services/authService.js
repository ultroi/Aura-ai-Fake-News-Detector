// API client for authentication
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const apiClient = {
  async call(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies for auth
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    let data;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        data = {
          success: false,
          error: { message: 'Failed to parse JSON response' }
        };
      }
    } else {
      const text = await response.text();
      data = {
        success: false,
        error: { message: text || 'Invalid server response' }
      };
    }

    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  },

  // Google OAuth login
  async googleLogin(token) {
    return this.call('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  // Send OTP to email
  async sendOTP(email) {
    return this.call('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Verify OTP
  async verifyOTP(email, otp) {
    return this.call('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  },

  // Get current user
  async getCurrentUser() {
    return this.call('/auth/me', {
      method: 'GET',
    });
  },

  // Logout
  async logout() {
    return this.call('/auth/logout', {
      method: 'POST',
    });
  },

  // Submit support request
  async submitSupportRequest(payload) {
    return this.call('/auth/support', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export default apiClient;
