const cron = require('node-cron');
const config = require('./config');
const reportService = require('./services/report');
const externalService = require('./services/external');
const google = require('./services/google');
const Settings = require('./controllers/settings');
const Weight = require('./controllers/weight'); // <-- Импортируем Weight

let tasks = [];

// Хелпер для мыслей
async function getDailyThoughts() {
  const rows = await google.getSheetData('Thoughts', 'A:C');
  const todayStr = new Date().toLocaleString('ru-RU').split(',')[0];
  const thoughts = {};

  rows.forEach(row => {
    if (row[0]?.split(',')[0] === todayStr) {
      if (!thoughts[row[1]]) thoughts[row[1]] = [];
      thoughts[row[1]].push(row[2]);
    }
  });
  return thoughts;
}

const startJobs = (bot) => {
  tasks.forEach(t => t.stop());
  tasks = [];
  const s = Settings.getSettings();

  console.log('⏳ Cron Settings:', {
    morning: `${s.morning_hour}:${s.morning_minute} (${s.morning_enabled})`,
    evening: `${s.evening_hour}:${s.evening_minute} (${s.evening_enabled})`
  });

  // 1. УТРО
  if (s.morning_enabled) {
    const min = s.morning_minute || 0;
    const schedule = `${min} ${s.morning_hour} * * *`;

    const task = cron.schedule(schedule, async () => {
      try {
        const weather = await externalService.getWeather();
        const rates = await externalService.getNbrbRates();
        const plan = await reportService.getMorningBriefing(new Date());

        const msg = `☀️ *Доброе утро!*\n\n${weather}\n\n${rates}\n\n${plan}`;
        await bot.telegram.sendMessage(config.CHAT_HQ_ID, msg, { parse_mode: 'Markdown' });
      } catch (e) { console.error(e); }
    }, { timezone: "Europe/Minsk" });
    tasks.push(task);
  }

  // 2. ВЕЧЕР
  if (s.evening_enabled) {
    const min = s.evening_minute || 0;
    const schedule = `${min} ${s.evening_hour} * * *`;

    const task = cron.schedule(schedule, async () => {
      try {
        // 1. Собираем данные
        const [weightStats, thoughtsData] = await Promise.all([
          Weight.getDailyStatus(),
          getDailyThoughts()
        ]);

        let userReport = '';

        for (const [userId, userData] of Object.entries(config.USERS)) {
          const name = userData.name;
          const weightStr = weightStats.has(name) ? '⚖️ Вес: 🥹 Записан' : '⚖️ Вес: 🌚 Не записан';

          // Мысли
          const thoughts = thoughtsData[name] || [];
          let thoughtStr = '';
          if (thoughts.length > 0) {
            thoughtStr = `\n🗣 Мысли:\n` + thoughts.map(t => `_«${t}»_`).join('\n');
          }

          userReport += `👤 *${name}*\n${weightStr}${thoughtStr}\n\n`;
        }

        const msg = `🌙 *Вечерний чек*\n\n${userReport}👇 *Не забудьте:*`;

        await bot.telegram.sendMessage(config.CHAT_HQ_ID, msg, {
          parse_mode: 'Markdown',
          ...require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.url('Перейти в бота', `https://t.me/${bot.botInfo.username}`)]
          ])
        });
      } catch (e) { console.error('Cron Evening Error:', e); }
    }, { timezone: "Europe/Minsk" });
    tasks.push(task);
  }
};

let botInstance = null;

module.exports = {
  init: (bot) => {
    botInstance = bot;
    startJobs(bot);
  },
  reload: () => {
    if (botInstance) startJobs(botInstance);
  }
};