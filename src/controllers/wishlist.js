const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

// Функция паузы
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

      // --- ДИАГНОСТИКА: СМОТРИМ, ЧТО ПРИШЛО ---
      // Если это сложный домен, но превью нет (или оно неполное)
      if (isHardDomain && (!msg.web_page || !msg.web_page.photo)) {
        console.log(`⚠️ Hard domain detected. Current WebPage:`, msg.web_page ? 'Present (No photo)' : 'MISSING');

        const mWait = await ctx.reply('⏳ Жду превью (5 сек)...');
        await sleep(5000); // Даем 5 секунд честно

        try {
          // Делаем форвард
          const forwardedMsg = await ctx.telegram.forwardMessage(
            ctx.chat.id,
            ctx.chat.id,
            msg.message_id,
            { disable_notification: true }
          );

          // ЛОГИРУЕМ ТО, ЧТО ПОЛУЧИЛИ В ФОРВАРДЕ
          console.log('📦 FORWARDED MSG DUMP:', JSON.stringify(forwardedMsg.web_page, null, 2));

          if (forwardedMsg && forwardedMsg.web_page) {
            console.log('✅ Preview caught via forward hack!');
            msg = forwardedMsg;
          } else {
            console.log('❌ Still no web_page after forward.');
          }

          // Удаляем мусор
          await ctx.deleteMessage(forwardedMsg.message_id).catch(() => { });
          await ctx.deleteMessage(mWait.message_id).catch(() => { });

        } catch (e) {
          console.error('Forward hack failed:', e.message);
          await ctx.deleteMessage(mWait.message_id).catch(() => { });
        }
      }
      // -----------------------------

      const m = await ctx.reply('🔎 Сохраняю...');

      try {
        const data = await meta.extractMeta(url, msg, ctx.telegram);
        console.log('📊 Extracted Data:', data); // Логируем результат парсинга

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

        // Отправка
        if (data.image && data.image.startsWith('http') && !data.image.includes('placeholder')) {
          try {
            await ctx.replyWithPhoto(data.image, { caption, parse_mode: 'Markdown' });
          } catch (imgError) {
            console.error('SendPhoto failed:', imgError.message);
            // Если фото не шлется - шлем текстом, но разрешаем превью!
            // disable_web_page_preview: false — пусть Телеграм сам покажет картинку внизу
            await ctx.reply(caption, { parse_mode: 'Markdown', disable_web_page_preview: false });
          }
        } else {
          // Если картинки не нашли — тоже шлем с превью, вдруг оно появится позже
          await ctx.reply(caption, { parse_mode: 'Markdown', disable_web_page_preview: false });
        }

      } catch (e) {
        console.error('Wishlist Fatal Error:', e);
        await ctx.deleteMessage(m.message_id).catch(() => { });
        ctx.reply('❌ Ошибка. Проверь логи.');
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