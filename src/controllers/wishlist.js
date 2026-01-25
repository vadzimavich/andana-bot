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
    const mStatus = await ctx.reply('⏳ Подготавливаю данные...');

    try {
      // --- ХАК: ПОЛУЧАЕМ ДАННЫЕ ИЗ ТЕЛЕГРАМА ---
      await sleep(4000); // Ждем, пока ТГ создаст превью

      // Пересылаем сообщение боту в личку (самому себе), чтобы "обновить" метаданные
      const forward = await ctx.telegram.forwardMessage(ctx.botInfo.id, ctx.chat.id, msg.message_id);

      // Теперь в объекте forward.web_page ГАРАНТИРОВАННО есть данные, если их видит ТГ
      const updatedMsg = forward;
      console.log('📲 Telegram Preview Data:', updatedMsg.web_page ? 'FOUND' : 'NOT FOUND');

      // Вызываем парсер, передавая ему "свежее" сообщение
      const data = await meta.extractMeta(url, updatedMsg, ctx.telegram);

      // Удаляем техническое сообщение
      await ctx.telegram.deleteMessage(ctx.botInfo.id, forward.message_id).catch(() => { });
      // ----------------------------------------

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
      ctx.reply('❌ Не удалось получить данные. Попробуй еще раз.');
    }
  },

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