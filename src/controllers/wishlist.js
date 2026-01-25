const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

module.exports = {
  async handleTopicMessage(ctx) {
    // Берем сообщение или его отредактированную версию
    const msg = ctx.message || ctx.editedMessage;
    const text = msg.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Удалено.' : '⚠️ Пусто.');
    }

    // Ищем ссылку
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const url = urlMatch[0];

      // --- ЛОГИКА "ЖДУНА" ---
      // Список доменов, которые мы НЕ парсим сами, а ждем превью от Телеграма
      const hardDomains = ['ozon', 'goldapple', 'lamoda'];
      const isHardDomain = hardDomains.some(d => url.includes(d));
      const hasPreview = msg.web_page;

      // Если это сложный домен и превью ЕЩЕ нет -> игнорируем.
      // Ждем, пока Телеграм обновит сообщение (сработает edited_message)
      if (isHardDomain && !hasPreview) {
        console.log('⏳ Waiting for Telegram preview for:', url);
        return;
      }
      // ----------------------

      const m = await ctx.reply('🔎 Сохраняю...');

      try {
        // Передаем ctx, чтобы extractMeta мог залезть в web_page
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
        const caption = `✨ *Добавлено в вишлист!*\n🏷 ${data.title}\n\n🌐 [Открыть каталог](${webLink})`;

        // --- БЕЗОПАСНАЯ ОТПРАВКА ---
        // Если картинки нет или она "битая" (placeholder), шлем просто текст
        if (data.image && data.image.startsWith('http') && !data.image.includes('placeholder')) {
          try {
            await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' });
          } catch (imgError) {
            console.error('Image send failed, sending text only:', imgError.message);
            await ctx.reply(caption, { parse_mode: 'Markdown', disable_web_page_preview: true });
          }
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