const app = require('./app');
const { env, validateRuntimeConfig } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');

const start = async () => {
  validateRuntimeConfig();
  await connectDatabase();

  const server = app.listen(env.port, () => {
    console.log(`\nAura AI MERN backend running on http://localhost:${env.port}`);
    console.log(`Frontend: ${env.frontendUrl}`);
    console.log(`Environment: ${env.nodeEnv}\n`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received; shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error) => {
  console.error('[server] Failed to start:', error.message);
  process.exit(1);
});
