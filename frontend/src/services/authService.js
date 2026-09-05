// API client for authentication - use environment variable or fallback
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ANALYSIS_API_URL = import.meta.env.VITE_ANALYSIS_API_URL || 'http://localhost:8000';

// Add request timeout and error handling wrapper
const apiClient = {
  async call(endpoint, options = {}, timeout = 30000) {
    const url = `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include', // Include cookies for auth
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
        const errorMsg = data.error?.message || data.message || data.detail || 'Request failed';
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout (${timeout}ms)`);
      }
      throw error;
    }
  },

  // Google OAuth login
  async googleLogin(token) {
    return this.call('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  // Email + password authentication
  async emailPasswordLogin(email, password) {
    return this.call('/auth/email-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Get current user
  async getCurrentUser() {
    return this.call('/auth/me', {
      method: 'GET',
    });
  },

  // Update profile
  async updateProfile(payload) {
    return this.call('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
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

// Export analysis API URL for use in other components
export { ANALYSIS_API_URL };
