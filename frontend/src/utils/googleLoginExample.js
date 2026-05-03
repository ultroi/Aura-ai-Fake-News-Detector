// Example: Complete Google Login Flow
// This is the complete fetch call pattern for sending Google credentials to backend

export const googleLoginFetch = async (credentialResponse) => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/auth/google`, {
      method: 'POST',
      credentials: 'include',  // CRITICAL: Include cookies for CORS with credentials
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        token: credentialResponse.credential  // Google JWT from credentialResponse
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Google login failed');
    }

    // Success: data.data.user contains user info
    return data.data.user;
  } catch (err) {
    console.error('Google login error:', err);
    throw err;
  }
};
