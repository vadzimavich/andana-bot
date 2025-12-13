const { Markup } = require('telegraf');
const google = require('../services/google');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

module.exports = {
  async menu(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }
    await clearChat(ctx);
    const rows = await google.getSheetData('Shopping', 'A:D');
    const activeItems = rows.filter(r => r[3] !== 'Done');

    const listText = activeItems.map(i => `• ${i[2]}`).join('\n');

    ctx.reply(`🛒 *Список покупок* (${activeItems.length}):\n\n${listText}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить', 'shop_add')],
        [Markup.button.callback('🗑 Вычеркнуть', 'shop_list')],
        [Markup.button.callback('🔙 Закрыть', 'close_menu')]
      ])
    });
  },

  async startAdd(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }
    state.set(ctx.from.id, { scene: 'SHOP_ADD', msgs: [] });
    const m = await ctx.reply('Что купить? (списком):', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    const text = ctx.message.text;
    const items = text.split(',').map(i => i.trim()).filter(i => i);

    for (const item of items) {
      await google.appendRow('Shopping', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, item, 'New']);
    }

    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply(`✅ Добавлено в список покупок:\n${items.map(i => `+ ${i}`).join('\n')}`);
  },

  async list(ctx) {
    // FIX: Оборачиваем удаление в try-catch, чтобы не крашилось, если сообщения уже нет
    try { await ctx.deleteMessage(); } catch (e) { }

    const rows = await google.getSheetData('Shopping', 'A:D');
    const items = rows.map((r, i) => ({ ...r, index: i + 1 })).filter(r => r[3] !== 'Done');

    if (!items.length) {
      return ctx.reply('Список покупок пуст! 🎉', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад', 'open_shopping')]
      ]));
    }

    const buttons = items.map(item => [Markup.button.callback(`◻️ ${item[2]}`, `shop_buy_${item.index}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'open_shopping')]);

    ctx.reply('Нажми, чтобы вычеркнуть:', Markup.inlineKeyboard(buttons));
  },

  async actionBuy(ctx) {
    const rowIndex = ctx.match[1];

    // Получаем имя до удаления
    const rows = await google.getSheetData('Shopping', `C${rowIndex}:C${rowIndex}`);
    const name = rows[0]?.[0] || 'Товар';

    await google.updateCell('Shopping', `D${rowIndex}`, 'Done');

    // Всплывающее уведомление
    await ctx.answerCbQuery(`Удалено из списка покупок: ${name}`);

    // FIX: Не удаляем сообщение здесь вручную.
    // Мы просто вызываем list(ctx), который сам удалит старое сообщение и пришлет обновленное.
    await module.exports.list(ctx);
  }
};