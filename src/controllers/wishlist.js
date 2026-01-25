const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  async handleTopicMessage(ctx) {
    const text = ctx.message.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Удалено.' : '⚠️ Пусто.');
    }

    // Ищем ссылку
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const url = urlMatch[0];

      // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
      // Ждем 1.5 секунды, чтобы Telegram успел подгрузить web_page (превью)
      // Это критично для Ozon и Золотого Яблока
      await ctx.replyWithChatAction('typing');
      await sleep(1500);
      // -----------------------

      const m = await ctx.reply('🔎 Сохраняю...');

      try {
        const data = await meta.extractMeta(url, ctx);

        await google.appendRow('Wishlist', [
          new Date().toLocaleString('ru-RU'),
          ctx.userConfig.name,
          data.title || 'Товар',
          data.url,
          data.image || '',
          'Active'
        ]);

        await ctx.deleteMessage(m.message_id).catch(() => { });

        const webLink = `${config.APP_URL}/wishlist`;

        // Формируем красивое сообщение
        const caption = `✨ *Добавлено в вишлист!*\n🏷 ${data.title}\n\n🌐 [Открыть каталог](${webLink})`;

        if (data.image && data.image.startsWith('http')) {
          await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' });
        } else {
          await ctx.reply(caption, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

      } catch (e) {
        console.error('Wishlist Error:', e);
        await ctx.deleteMessage(m.message_id).catch(() => { });
        ctx.reply('❌ Не удалось добавить товар (ошибка таблицы).');
      }
    }
  },

  // ... (остальные методы без изменений)
  async sendInterface(ctx) {
    const webLink = `${config.APP_URL}/wishlist`;
    const text = `🎁 *Тема: Вишлисты*\nКидай сюда ссылки.\n\n🌐 [Открыть каталог](${webLink})`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🌐 Открыть в браузере', webLink)],
      [Markup.button.callback('🗑 Удалить последнюю', 'wishlist_undo')]
    ]);

    await ctx.replyWithMarkdown(text, keyboard);
  },

  async undo(ctx) {
    const success = await google.deleteLastRow('Wishlist');
    const msg = success ? '🗑 Удалено.' : '⚠️ Пусто.';
    ctx.answerCbQuery(msg);
    ctx.reply(msg);
  }
};