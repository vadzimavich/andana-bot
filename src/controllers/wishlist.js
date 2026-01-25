const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  async handleTopicMessage(ctx) {
    let msg = ctx.message || ctx.editedMessage;
    const text = msg.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Удалено.' : '⚠️ Пусто.');
    }

    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const url = urlMatch[0];
      const hardDomains = ['ozon', 'goldapple', 'lamoda'];
      const isHardDomain = hardDomains.some(d => url.includes(d));

      // ПРОВЕРКА: Если это сложный домен И (нет превью ИЛИ нет фото в превью)
      // Мы хотим добиться фото, поэтому будем ждать и форвардить
      const hasGoodPreview = msg.web_page && msg.web_page.photo;

      if (isHardDomain && !hasGoodPreview) {
        const mWait = await ctx.reply('⏳ Жду картинку от Телеграма...');
        await sleep(3000); // Ждем генерацию на серверах ТГ

        try {
          // Форвардим, чтобы получить обновленный объект
          const forwardedMsg = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            ctx.chat.id,
            msg.message_id,
            { disable_notification: true }
          );

          // Если в форварде есть превью - используем его
          if (forwardedMsg && forwardedMsg.web_page) {
            console.log('✅ Preview caught via forward hack!');
            msg = forwardedMsg; // Подменяем сообщение на форвард (там данные свежее)
          }

          // Чистим мусор
          await ctx.deleteMessage(forwardedMsg.message_id).catch(() => { });
          await ctx.deleteMessage(mWait.message_id).catch(() => { });

        } catch (e) {
          console.error('Forward hack failed:', e.message);
          await ctx.deleteMessage(mWait.message_id).catch(() => { });
        }
      }

      const m = await ctx.reply('🔎 Сохраняю...');

      try {
        // ВАЖНО: Передаем msg (актуальный объект сообщения) и ctx.telegram
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
        const caption = `✨ *Добавлено в вишлист!*\n🏷 ${data.title}\n\n🌐 [Открыть каталог](${webLink})`;

        if (data.image && data.image.startsWith('http') && !data.image.includes('placeholder')) {
          try {
            await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' });
          } catch (imgError) {
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