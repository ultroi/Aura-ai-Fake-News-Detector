const mongoose = require('mongoose');

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
  const fallbackLocalURI = process.env.MONGODB_FALLBACK_URI || 'mongodb://127.0.0.1:27017/aura-auth';

  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aura-auth';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✓ MongoDB connected successfully');
    return true;
  } catch (error) {
    const isSrvUri = (process.env.MONGODB_URI || '').startsWith('mongodb+srv://');
    const dnsSrvLookupFailed = /querySrv|ENOTFOUND|ECONNREFUSED/i.test(error.message || '');

    if (isSrvUri && dnsSrvLookupFailed) {
      console.warn('⚠ Atlas SRV DNS lookup failed. Falling back to local MongoDB...');

      try {
        await mongoose.connect(fallbackLocalURI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });

        console.log(`✓ MongoDB connected successfully (fallback: ${fallbackLocalURI})`);
        return true;
      } catch (fallbackError) {
        console.error('✗ MongoDB fallback connection error:', fallbackError.message);
        process.exit(1);
      }
    }

    console.error('✗ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB
 */
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('✗ MongoDB disconnection error:', error.message);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
