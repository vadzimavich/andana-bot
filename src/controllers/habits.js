const { Markup } = require('telegraf');
const google = require('../services/google');
const charts = require('../services/charts');
const { clearChat } = require('../utils/helpers');
const Settings = require('./settings');
const state = require('../state');
const keyboards = require('../keyboards');
const config = require('../config');

const getTodayStr = () => new Date().toLocaleString('ru-RU').split(',')[0];

// --- ЛОГИКА ХРАНЕНИЯ ---
function getUserHabits(userId) {
  const s = Settings.getSettings();
  if (!s.users) s.users = {};
  if (!s.users[userId]) {
    const defaultHabits = config.USERS[userId]?.habits || [];
    s.users[userId] = { habits: defaultHabits };
    Settings.saveSettings(s);
  }
  return s.users[userId].habits || [];
}

function saveUserHabit(userId, habit) {
  const s = Settings.getSettings();
  if (!s.users) s.users = {};
  if (!s.users[userId]) s.users[userId] = { habits: [] };

  if (!s.users[userId].habits.includes(habit)) {
    s.users[userId].habits.push(habit);
    Settings.saveSettings(s);
  }
}

function deleteUserHabit(userId, habit) {
  const s = Settings.getSettings();
  if (s.users && s.users[userId]) {
    s.users[userId].habits = s.users[userId].habits.filter(h => h !== habit);
    Settings.saveSettings(s);
  }
}

// --- КОНТРОЛЛЕР ---
module.exports = {
  getUserHabits,

  async getDailySummary() {
    const rows = await google.getSheetData('Habits', 'A:C');
    const todayStr = getTodayStr();
    const stats = {};

    rows.forEach(row => {
      if (row[0]?.split(',')[0] === todayStr) {
        const user = row[1];
        const habit = row[2];
        if (!stats[user]) stats[user] = new Set();
        stats[user].add(habit);
      }
    });
    return stats;
  },

  async menu(ctx) {
    if (ctx.message) try { await ctx.deleteMessage(); } catch (e) { }
    if (!ctx.callbackQuery) await clearChat(ctx);

    const habits = getUserHabits(ctx.from.id);

    if (!habits.length) {
      return ctx.reply('Список привычек пуст.', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить привычку', 'habit_add_new')],
        [Markup.button.callback('🔙 Закрыть', 'close_menu')]
      ]));
    }

    const rows = await google.getSheetData('Habits', 'A:C');
    const todayStr = getTodayStr();
    const completedToday = new Set();

    rows.forEach(row => {
      const rowDate = row[0]?.split(',')[0];
      if (rowDate === todayStr && row[1] === ctx.userConfig.name) {
        completedToday.add(row[2]);
      }
    });

    const buttons = habits.map(habit => {
      const isDone = completedToday.has(habit);
      const icon = isDone ? '✅' : '⭕️';
      return [Markup.button.callback(`${icon} ${habit}`, `habit_toggle_${habit}`)];
    });

    // Убрали кнопку "График", оставили только управление
    buttons.push([Markup.button.callback('➕ Добавить', 'habit_add_new'), Markup.button.callback('🗑 Удалить', 'habit_del_menu')]);
    buttons.push([Markup.button.callback('🔙 Закрыть', 'close_menu')]);

    const text = `📅 *Привычки на ${todayStr}*\nСделано: ${completedToday.size} из ${habits.length}`;

    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      }
    } catch (e) {
      await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
  },

  async toggle(ctx) {
    const habitName = ctx.match[1];
    const todayStr = getTodayStr();
    const rows = await google.getSheetData('Habits', 'A:C');

    let rowIndexToDelete = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r[0]?.split(',')[0] === todayStr && r[1] === ctx.userConfig.name && r[2] === habitName) {
        rowIndexToDelete = i + 1;
        break;
      }
    }

    if (rowIndexToDelete !== -1) {
      await google.deleteRow('Habits', rowIndexToDelete);
      await ctx.answerCbQuery(`Отменено: ${habitName}`);
    } else {
      await google.appendRow('Habits', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, habitName, 1]);
      await ctx.answerCbQuery(`Супер! ${habitName}`);
    }

    await module.exports.menu(ctx);
  },

  async startAdd(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }
    state.set(ctx.from.id, { scene: 'HABIT_ADD', msgs: [] });
    const m = await ctx.reply('Напиши название новой привычки:', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    const text = ctx.message.text;
    saveUserHabit(ctx.from.id, text);
    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply(`✅ Привычка "${text}" добавлена.`);
    setTimeout(() => module.exports.menu(ctx), 500);
  },

  async deleteMenu(ctx) {
    const habits = getUserHabits(ctx.from.id);
    const buttons = habits.map(h => [Markup.button.callback(`🗑 ${h}`, `habit_delete_${h}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'habit_back')]);

    try {
      await ctx.editMessageText('Выберите привычку для удаления:', Markup.inlineKeyboard(buttons));
    } catch (e) {
      await ctx.reply('Выберите привычку для удаления:', Markup.inlineKeyboard(buttons));
    }
  },

  async deleteAction(ctx) {
    const habit = ctx.match[1];
    deleteUserHabit(ctx.from.id, habit);
    await ctx.answerCbQuery(`Удалено: ${habit}`);
    await module.exports.deleteMenu(ctx);
  },

  // Этот метод теперь вызывается только из "Отчеты" -> "Привычки"
  async report(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }

    const m = await ctx.reply('📊 Рисую график...');

    const rows = await google.getSheetData('Habits', 'A:C');
    const habits = getUserHabits(ctx.from.id);

    const stats = {};
    habits.forEach(h => stats[h] = 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    rows.forEach(row => {
      if (row[1] !== ctx.userConfig.name) return;
      const [datePart] = row[0].split(',');
      const [day, month, year] = datePart.split('.').map(Number);
      const rowDate = new Date(year, month - 1, day);

      if (rowDate >= sevenDaysAgo && stats[row[2]] !== undefined) {
        stats[row[2]]++;
      }
    });

    const labels = Object.keys(stats);
    const data = Object.values(stats);

    await ctx.deleteMessage(m.message_id);

    if (labels.length === 0) {
      return ctx.reply('Нет данных для графика.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Закрыть', 'close_menu')]]));
    }

    const img = await charts.generateHabitChart(labels, data, 'Выполнено раз за 7 дней');

    await ctx.replyWithPhoto({ source: img }, {
      caption: 'Твоя статистика за неделю',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Закрыть', 'close_menu')]
      ])
    });
  }
};