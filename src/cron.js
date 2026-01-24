const cron = require('node-cron');
const config = require('./config');
const reportService = require('./services/report');
const externalService = require('./services/external');
const google = require('./services/google');
const Settings = require('./controllers/settings');
const Weight = require('./controllers/weight');
const Finance = require('./controllers/finance');
const ai = require('./services/ai');

let tasks = [];

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
        const [weightStats, thoughtsData] = await Promise.all([
          Weight.getDailyStatus(),
          getDailyThoughts()
        ]);

        let userReport = '';

        for (const [userId, userData] of Object.entries(config.USERS)) {
          const name = userData.name;
          const weightStr = weightStats.has(name) ? '⚖️ Вес: 🥹 Записан' : '⚖️ Вес: 🌚 Не записан';

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

  // 3. КОНЕЦ МЕСЯЦА (Авто-отчет)
  // Запускаем в 23:55 в последний день месяца
  const endMonthTask = cron.schedule('55 23 28-31 * *', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Если завтра 1-е число, значит сегодня последний день
    if (tomorrow.getDate() === 1) {
      const monthStr = `${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;

      // Создаем фейковый контекст для отправки отчета
      const ctx = {
        reply: (text) => bot.telegram.sendMessage(config.CHAT_HQ_ID, text),
        replyWithPhoto: (photo, opts) => bot.telegram.sendPhoto(config.CHAT_HQ_ID, photo.source, opts),
        deleteMessage: () => { }, // Заглушка
        userConfig: { name: 'System' }
      };

      await bot.telegram.sendMessage(config.CHAT_HQ_ID, `📅 Месяц ${monthStr} завершен! Итоги:`);
      await Finance.generateReport(ctx, monthStr);
    }
  }, { timezone: "Europe/Minsk" });
  tasks.push(endMonthTask);


  // 4. НЕДЕЛЬНЫЙ ОТЧЕТ (Воскресенье 21:00)
  // У тебя был выключен, включим
  const weeklySchedule = `0 21 * * 0`;

  const weeklyTask = cron.schedule(weeklySchedule, async () => {
    try {
      // 1. Собираем суммы за 7 дней
      const rows = await google.getSheetData('Finances', 'A:D');
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);

      let total = 0;
      let summary = "";
      const cats = {};

      rows.forEach(r => {
        if (!r[0] || r[0] === 'Date') return;
        const [d, m, y] = r[0].split(',')[0].split('.').map(Number);
        const date = new Date(y, m - 1, d);

        if (date >= weekAgo) {
          const amount = parseFloat(r[3].replace(',', '.'));
          cats[r[2]] = (cats[r[2]] || 0) + amount;
          total += amount;
        }
      });

      for (const [c, s] of Object.entries(cats)) summary += `${c}: ${s} BYN\n`;

      // 2. Отправляем ИИ
      const aiComment = await ai.analyzeFinances(summary);

      const msg = `📅 *Итоги недели*\nПотрачено: ${total.toFixed(2)} BYN\n\n${aiComment}`;

      await bot.telegram.sendMessage(config.CHAT_HQ_ID, msg, { parse_mode: 'Markdown' });

    } catch (e) { console.error('Weekly Error', e); }
  }, { timezone: "Europe/Minsk" });
  tasks.push(weeklyTask);
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