/**
 * Environment validation
 */
const validateEnv = () => {
  const requiredEnvVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'EMAIL_HOST',
    'EMAIL_USER',
    'EMAIL_PASSWORD',
  ];

  const missingVars = requiredEnvVars.filter(
    varName => !process.env[varName]
  );

  if (missingVars.length > 0) {
    console.warn(`⚠ Warning: Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('⚠ Some features may not work properly. Check .env file.');
  }
};

module.exports = {
  validateEnv,
};
