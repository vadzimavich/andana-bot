const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

// Функция паузы
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  async handleTopicMessage(ctx) {
    // Работаем с актуальным объектом сообщения
    let msg = ctx.message || ctx.editedMessage;
    const text = msg.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Удалено.' : '⚠️ Пусто.');
    }

    // Ищем ссылку
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const url = urlMatch[0];

      // Список доменов, где мы полагаемся ТОЛЬКО на Телеграм
      const hardDomains = ['ozon', 'goldapple', 'lamoda'];
      const isHardDomain = hardDomains.some(d => url.includes(d));

      // --- СТРАТЕГИЯ "ПИНГ-ПОНГ" ---
      // Если это сложный домен и превью нет, мы пытаемся его "выбить"
      if (isHardDomain && !msg.web_page) {
        const mWait = await ctx.reply('⏳ Жду превью от Телеграма...');

        // Ждем 3 секунды, пока серверы ТГ сгенерируют картинку
        await sleep(3000);

        try {
          // ХАК: Форвардим сообщение в этот же чат. 
          // Метод forwardMessage возвращает АКТУАЛЬНЫЙ объект сообщения (с превью).
          const forwardedMsg = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            ctx.chat.id,
            msg.message_id,
            { disable_notification: true }
          );

          // Если в форварде появилось превью — берем его
          if (forwardedMsg && forwardedMsg.web_page) {
            console.log('✅ Preview caught via forward hack!');
            // Подменяем web_page в нашем объекте msg, чтобы extractMeta его увидел
            msg.web_page = forwardedMsg.web_page;

            // Если ctx.message существует, обновляем и его (на всякий случай)
            if (ctx.message) ctx.message.web_page = forwardedMsg.web_page;
          }

          // Удаляем технический форвард и сообщение "Жду..."
          await ctx.deleteMessage(forwardedMsg.message_id).catch(() => { });
          await ctx.deleteMessage(mWait.message_id).catch(() => { });

        } catch (e) {
          console.error('Forward hack failed:', e.message);
          // Если не вышло — удаляем "Жду" и пробуем как есть (скорее всего упадет в fallback)
          await ctx.deleteMessage(mWait.message_id).catch(() => { });
        }
      }
      // -----------------------------

      const m = await ctx.reply('🔎 Сохраняю...');

      try {
        // Важно: extractMeta внутри смотрит на ctx.message.web_page.
        // Мы обновили его выше в блоке "Пинг-Понг".
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

        // Безопасная отправка (если картинка битая, шлем текст)
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