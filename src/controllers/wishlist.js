const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const config = require('../config');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    const mStatus = await ctx.reply('⏳ Парсим товар...');

    try {
      // Ждем, пока сервера Telegram сформируют превью
      await sleep(3500);

      // ХАК: Пересылаем сообщение пользователю в личку, чтобы получить объект web_page
      // Это обходит блокировки Ozon/GoldApple, так как данные берем у самого Telegram
      const forward = await ctx.telegram.forwardMessage(ctx.from.id, ctx.chat.id, msg.message_id, {
        disable_notification: true
      });

      console.log('📲 Preview status:', forward.web_page ? '✅ FOUND' : '❌ NOT FOUND');

      // Извлекаем данные из пересланного сообщения
      const data = await meta.extractMeta(url, forward, ctx.telegram);

      // Сразу удаляем форвард из твоей лички
      await ctx.telegram.deleteMessage(ctx.from.id, forward.message_id).catch(() => { });

      await google.appendRow('Wishlist', [
        new Date().toLocaleString('ru-RU'),
        ctx.userConfig.name,
        data.title || 'Товар',
        data.url,
        data.image || '',
        'Active'
      ]);

      await ctx.deleteMessage(mStatus.message_id).catch(() => { });

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
      await ctx.deleteMessage(mStatus.message_id).catch(() => { });
      ctx.reply('❌ Ошибка. Попробуй еще раз через пару секунд.');
    }
  },

  async sendInterface(ctx) {
    const webLink = `${config.APP_URL}/wishlist`;
    await ctx.replyWithMarkdown(`🎁 *Вишлист*\nКидай ссылки на товары.`, Markup.inlineKeyboard([
      [Markup.button.url('🌐 Открыть вишлист', webLink)],
      [Markup.button.callback('🗑 Удалить последнюю', 'wishlist_undo')]
    ]));
  },

  async undo(ctx) {
    const success = await google.deleteLastRow('Wishlist');
    ctx.answerCbQuery(success ? 'Удалено' : 'Пусто');
  }
};