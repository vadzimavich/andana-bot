const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

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
      const m = await ctx.reply('🔎 Парсим товар...');
      const url = urlMatch[0];

      try {
        const data = await meta.extractMeta(url);

        await google.appendRow('Wishlist', [
          new Date().toLocaleString('ru-RU'),
          ctx.userConfig.name,
          data.title || 'Товар',
          data.url,
          data.image || '',
          'Active'
        ]);

        await ctx.deleteMessage(m.message_id).catch(() => { });

        // Исправленный URL
        const webLink = `${config.APP_URL}/wishlist`;
        ctx.reply(`✨ Добавлено!\n🏷 [${data.title}](${data.url})\n\n🌐 ${webLink}`, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('Wishlist Error:', e);
        await ctx.deleteMessage(m.message_id).catch(() => { });
        ctx.reply('❌ Не удалось добавить товар. Попробуйте другую ссылку.');
      }
    }
  },

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