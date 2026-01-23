const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');
const { clearChat } = require('../utils/helpers');
const state = require('../state');
const keyboards = require('../keyboards');
const config = require('../config');
const google = require('../services/google');

let LOCAL_CACHE = null;

// --- ИНИЦИАЛИЗАЦИЯ ---
async function init() {
  console.log('📥 Loading settings from Google...');
  const cloudData = await google.getSettingsJson();

  // МЕРДЖ: Берем дефолты и накладываем сверху то, что пришло из облака
  // Это гарантирует, что новые поля (минуты) будут иметь значения из конфига, если их нет в базе
  LOCAL_CACHE = {
    ...config.CRON_DEFAULTS,
    ...cloudData,
    // Если в облаке есть users, берем их, иначе пустой объект (чтобы не затереть дефолт)
    users: cloudData?.users || {}
  };

  console.log('✅ Settings loaded (Merged):', LOCAL_CACHE);
}

function getSettings() {
  // Если кэш еще не готов (редкий случай), возвращаем дефолт
  return LOCAL_CACHE || config.CRON_DEFAULTS;
}

// Изменили на ASYNC, чтобы ждать сохранения
async function saveSettings(data) {
  LOCAL_CACHE = data; // Обновляем память мгновенно

  // Перезагружаем крон сразу, чтобы юзер не ждал
  try { require('../cron').reload(); } catch (e) { console.error(e); }

  // Отправляем в Google и логируем результат
  console.log('☁️ Sending to Google:', JSON.stringify(data).slice(0, 50) + '...');
  const success = await google.saveSettingsJson(data);

  if (success) console.log('☁️ Google Sync OK');
  else console.error('⚠️ Google Sync FAILED');
}

const fmtTime = (h, m) => {
  const hh = String(h).padStart(2, '0');
  const mm = String(m || 0).padStart(2, '0');
  return `${hh}:${mm}`;
};

module.exports = {
  init,
  getSettings,
  saveSettings,

  // --- МЕНЮ ---
  async menu(ctx) {
    if (ctx.message) try { await ctx.deleteMessage(); } catch (e) { }
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'settings_menu') await clearChat(ctx);

    const s = getSettings();

    const stM = s.morning_enabled ? '✅' : '🔴';
    const stE = s.evening_enabled ? '✅' : '🔴';
    const timeM = fmtTime(s.morning_hour, s.morning_minute);
    const timeE = fmtTime(s.evening_hour, s.evening_minute);

    const text = `⚙️ *Конфигурация Cron*\n\n` +
      `☀️ *Утро:* ${stM} в ${timeM}\n` +
      `🌙 *Вечер:* ${stE} в ${timeE}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`${stM} Утро`, 'set_toggle_morning'),
        Markup.button.callback(`${stE} Вечер`, 'set_toggle_evening')
      ],
      [
        Markup.button.callback(`⏰ Утро (${timeM})`, 'set_ask_morning'),
        Markup.button.callback(`⏰ Вечер (${timeE})`, 'set_ask_evening')
      ],
      [Markup.button.callback('🔙 Закрыть', 'close_menu')]
    ]);

    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
      } catch (e) { await ctx.answerCbQuery('Актуально'); }
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    }
  },

  // --- TOGGLE ---
  async toggle(ctx) {
    const type = ctx.match[1];
    const s = getSettings();
    const key = `${type}_enabled`;
    s[key] = !s[key];

    // Ждем сохранения перед обновлением меню
    await saveSettings(s);

    try { await ctx.deleteMessage(); } catch (e) { } // Удаляем старое, чтобы прислать новое (или можно edit)
    await module.exports.menu(ctx);
  },

  // --- ASK TIME ---
  async askTime(ctx) {
    const type = ctx.match[1];
    try { await ctx.deleteMessage(); } catch (e) { }
    state.set(ctx.from.id, { scene: 'SET_TIME', type: type, msgs: [] });
    const label = type === 'morning' ? 'Утра' : 'Вечера';

    const m = await ctx.reply(`⌨️ Введите время для *${label}* (ЧЧ:ММ):`, keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  // --- HANDLE TEXT ---
  async handleText(ctx) {
    const s = state.get(ctx.from.id);
    const text = ctx.message.text;
    const timeRegex = /^(\d{1,2})[:.]?(\d{2})?$/;
    const match = text.match(timeRegex);

    if (!match) {
      const m = await ctx.reply('⚠️ Неверный формат. Пример: 09:00', keyboards.CancelButton);
      state.addMsgToDelete(ctx.from.id, m.message_id);
      return;
    }

    let h = parseInt(match[1]);
    let m = parseInt(match[2] || '0');

    if (h > 23 || m > 59) {
      const msg = await ctx.reply('⚠️ Ошибка времени.', keyboards.CancelButton);
      state.addMsgToDelete(ctx.from.id, msg.message_id);
      return;
    }

    const settings = getSettings();
    settings[`${s.type}_hour`] = h;
    settings[`${s.type}_minute`] = m;

    // Ждем сохранения!
    await saveSettings(settings);

    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply(`✅ Время обновлено: ${fmtTime(h, m)}`);
    await module.exports.menu(ctx);
  },

  async linkTopic(ctx) {
    const topicId = ctx.message.message_thread_id;
    if (!topicId) return ctx.reply('Эту команду нужно писать внутри Темы (Topic).');

    // /link expenses
    const type = ctx.message.text.split(' ')[1]?.toLowerCase();
    const validTypes = Object.values(config.TOPICS);

    if (!validTypes.includes(type)) {
      return ctx.reply(`⚠️ Неверный тип.\nДоступные: ${validTypes.join(', ')}\nПример: /link expenses`);
    }

    const s = module.exports.getSettings();
    if (!s.topics) s.topics = {};

    // Сохраняем ID темы -> Тип
    s.topics[topicId] = type;
    await module.exports.saveSettings(s);

    ctx.reply(`✅ Тема привязана к функции: *${type.toUpperCase()}*`, { parse_mode: 'Markdown' });
  },

  getTopicType(topicId) {
    const s = module.exports.getSettings();
    return s.topics ? s.topics[topicId] : null;
  }
};