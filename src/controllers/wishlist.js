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
        // Вызываем наш новый парсер
        const data = await meta.extractMeta(url);

        console.log('📝 Saving to Sheets:', data.title);

        await google.appendRow('Wishlist', [
          new Date().toLocaleString('ru-RU'),
          ctx.userConfig.name,
          data.title,
          data.url,
          data.image,
          'Active'
        ]);

        await ctx.deleteMessage(m.message_id).catch(() => { });

        const webLink = `${config.APP_URL}/wishlist`;
        // Отправляем превью с картинкой (если она есть)
        if (data.image && !data.image.includes('placeholder')) {
          await ctx.replyWithPhoto(data.image, {
            caption: `✨ *Добавлено!*\n🏷 ${data.title}\n\n🌐 [Вишлист](${webLink})`,
            parse_mode: 'Markdown'
          });
        } else {
          ctx.reply(`✨ *Добавлено!*\n🏷 ${data.title}\n\n🌐 [Вишлист](${webLink})`, { parse_mode: 'Markdown' });
        }

      } catch (e) {
        console.error('Wishlist Controller Error:', e);
        await ctx.deleteMessage(m.message_id).catch(() => { });
        ctx.reply('❌ Ошибка при добавлении. Ссылка сохранена как есть.');
        // Аварийное сохранение
        await google.appendRow('Wishlist', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, 'Ссылка', url, '', 'Active']);
      }
    }
  },

  // ... (sendInterface, undo остаются)
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