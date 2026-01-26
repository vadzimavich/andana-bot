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

    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return;

    const url = urlMatch[0];
    const m = await ctx.reply('🔎 Обработка...');

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

      const webLink = `${config.APP_URL}/wishlist`;
      const caption = `✨ *Добавлено!*\n🏷 ${data.title}\n\n🌐 [Каталог](${webLink})`;

      if (data.image && data.image.startsWith('http')) {
        await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' }).catch(async () => {
          await ctx.reply(caption, { parse_mode: 'Markdown' });
        });
      } else {
        await ctx.reply(caption, { parse_mode: 'Markdown' });
      }
    } catch (e) {
      console.error('❌ Full error:', e);
      console.error('Stack:', e.stack);
      ctx.reply('❌ Ошибка. Попробуй еще раз.');
    }
  },
  // ... (остальные методы без изменений)
  async sendInterface(ctx) {
    const webLink = `${config.APP_URL}/wishlist`;
    await ctx.replyWithMarkdown(`🎁 *Вишлист*\nКидай ссылки сюда.`, Markup.inlineKeyboard([
      [Markup.button.url('🌐 Открыть вишлист', webLink)],
      [Markup.button.callback('🗑 Удалить последнюю', 'wishlist_undo')]
    ]));
  },
  async undo(ctx) {
    const success = await google.deleteLastRow('Wishlist');
    ctx.answerCbQuery(success ? 'Удалено' : 'Пусто');
  }
};