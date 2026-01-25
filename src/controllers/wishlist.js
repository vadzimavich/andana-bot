const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

module.exports = {
  async handleTopicMessage(ctx) {
    const msg = ctx.message || ctx.editedMessage;
    const text = msg.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Удалено.' : '⚠️ Пусто.');
    }

    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return;

    const url = urlMatch[0];
    const m = await ctx.reply('🔎 Обработка...');

    try {
      // Прямой вызов нового "умного" мета-парсера
      const data = await meta.extractMeta(url, msg, ctx.telegram);

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
      const caption = `✨ *Добавлено!*\n🏷 ${data.title}\n\n🌐 [Каталог](${webLink})`;

      if (data.image && data.image.startsWith('http')) {
        try {
          await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' });
        } catch (e) {
          await ctx.reply(caption, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(caption, { parse_mode: 'Markdown' });
      }

    } catch (e) {
      console.error('Wishlist Error:', e);
      await ctx.deleteMessage(m.message_id).catch(() => { });
      ctx.reply('❌ Ошибка при сохранении.');
    }
  },

  async sendInterface(ctx) {
    const webLink = `${config.APP_URL}/wishlist`;
    const text = `🎁 *Вишлист*\nПросто кидай ссылки на товары.`;
    await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([
      [Markup.button.url('🌐 Открыть вишлист', webLink)],
      [Markup.button.callback('🗑 Удалить последнюю', 'wishlist_undo')]
    ]));
  },

  async undo(ctx) {
    const success = await google.deleteLastRow('Wishlist');
    ctx.answerCbQuery(success ? 'Удалено' : 'Пусто');
  }
};