// backend/src/config/configuration.ts

// Helper function to safely parse integers from environment variables
const getInt = (envVar: string | undefined, defaultValue: number): number => {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

export default () => ({
  port: getInt(process.env.PORT, 3001),
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/email-scraper',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: '7d',
  },
  scraping: {
    rateLimitDelay: getInt(process.env.SCRAPING_RATE_LIMIT, 1000),
    maxConcurrent: getInt(process.env.MAX_CONCURRENT_SCRAPES, 3),
  },
  email: {
    defaultDailyLimit: getInt(process.env.DEFAULT_DAILY_LIMIT, 500),
  },
  search: {
    googleApiKey: process.env.GOOGLE_SEARCH_API_KEY,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
    serpApiKey: process.env.SERP_API_KEY,
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
});