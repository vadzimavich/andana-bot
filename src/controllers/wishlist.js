const { Markup } = require('telegraf');
const google = require('../services/google');
const meta = require('../services/metadata');
const state = require('../state');
const config = require('../config');
const { clearChat } = require('../utils/helpers');

module.exports = {
  // Сюда роутим сообщения из темы "Хотелки"
  async handleTopicMessage(ctx) {
    const text = ctx.message.text;

    // Удаление
    if (text === '/undo') {
      const success = await google.deleteLastRow('Wishlist');
      return ctx.reply(success ? '🗑 Последняя хотелка удалена.' : '⚠️ Список пуст.');
    }

    // Проверка на ссылку
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const m = await ctx.reply('🔎 Ищу информацию о товаре...');
      const url = urlMatch[0];
      const data = await meta.extractMeta(url);

      // Записываем: Дата, Юзер, Название, Ссылка, Картинка, Статус
      await google.appendRow('Wishlist', [
        new Date().toLocaleString('ru-RU'),
        ctx.userConfig.name,
        data.title,
        data.url,
        data.image,
        'Active'
      ]);

      await ctx.deleteMessage(m.message_id);
      // Ссылка на веб-страницу
      const webLink = `${config.APP_URL}/wishlist/${ctx.from.id}`; // APP_URL настроим ниже
      ctx.reply(`✨ Добавлено в вишлист!\n🏷 [${data.title}](${data.url})\n\n🌐 Смотреть вишлисты: ${webLink}`, { parse_mode: 'Markdown' });
    }
  },

  // Пульт для темы
  async sendInterface(ctx) {
    const webLink = `${config.APP_URL}/wishlist`;
    const text = `🎁 *Тема: Вишлисты (Хотелки)*\n\n` +
      `Кидай сюда ссылки на товары с Wildberries, Ozon или любые другие.\n\n` +
      `🌐 [Открыть красивый веб-каталог](${webLink})`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('🌐 Открыть в браузере', webLink)],
      [Markup.button.callback('🗑 Удалить последнюю', 'wishlist_undo')]
    ]);

    await ctx.replyWithMarkdown(text, keyboard);
  },

  async undo(ctx) {
    const success = await google.deleteLastRow('Wishlist');
    const msg = success ? '🗑 Последняя хотелка удалена.' : '⚠️ Список пуст.';
    ctx.answerCbQuery(msg);
    ctx.reply(msg);
  }
};
