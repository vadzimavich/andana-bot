require('dotenv').config();

const ANDREY_ID = parseInt(process.env.ANDREY_ID);
const ANYA_ID = parseInt(process.env.ANYA_ID);

const googleCreds = process.env.GOOGLE_CREDENTIALS_BASE64
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8'))
  : null;

module.exports = {
  APP_URL: 'https://andana-bot-2.onrender.com',
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  GEMINI_KEY: process.env.GEMINI_API_KEY,
  SCRAPER_API_KEY: process.env.SCRAPER_API_KEY,
  GOOGLE_CREDS: googleCreds,
  SHEET_ID: process.env.SHEET_ID,
  CALENDAR_IDS: {
    SHARED: process.env.CAL_SHARED_ID,
    ANDREY: process.env.CAL_ANDREY_ID,
    ANYA: process.env.CAL_ANYA_ID,
  },
  USERS: {
    [ANDREY_ID]: { name: 'Андрей', role: 'admin' },
    [ANYA_ID]: { name: 'Аня', role: 'admin' },
  },
  CHAT_HQ_ID: process.env.CHAT_HQ_ID,
  PORT: process.env.PORT || 3000,

  // Типы тем для привязки
  TOPICS: {
    EXPENSES: 'expenses',
    SHOPPING: 'shopping',
    INBOX: 'inbox',
    IDEAS: 'ideas',
    WISHLIST: 'wishlist'
  },

  CRON_DEFAULTS: {
    morning_hour: 8,
    evening_hour: 23,
    morning_enabled: true,
    evening_enabled: true
  }
};