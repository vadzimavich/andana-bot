const { Markup } = require('telegraf');
const google = require('../services/google');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

module.exports = {
  async menu(ctx) {
    // УБРАЛИ лишнее удаление
    await clearChat(ctx);

    const shopRows = await google.getSheetData('Shopping', 'D:D');
    const activeShopCount = shopRows.slice(1).filter(r => r[0] !== 'Done').length;
    const shopBtnText = activeShopCount > 0 ? `🛒 Покупки (${activeShopCount})` : '🛒 Покупки';

    ctx.reply('📝 *Задачи (Inbox)*:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Новая задача', 'task_add')],
        [Markup.button.callback('📂 Разгрести задачи', 'task_list')],
        [Markup.button.callback(shopBtnText, 'open_shopping')],
        [Markup.button.callback('🔙 Отмена', 'close_menu')]
      ])
    });
  },

  async startAdd(ctx) {
    // Тут удаление НУЖНО, так как это callback
    try { await ctx.deleteMessage(); } catch (e) { }
    state.set(ctx.from.id, { scene: 'TASK_ADD', msgs: [] });
    const m = await ctx.reply('Напиши задачу:', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    await google.appendRow('Inbox', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, ctx.message.text, 'New']);
    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply(`✅ Задача сохранена: "${ctx.message.text}"`, keyboards.MainMenu);
  },

  async list(ctx) {
    await ctx.deleteMessage();
    const rows = await google.getSheetData('Inbox', 'A:D');
    const tasks = rows.map((r, i) => ({ ...r, index: i + 1 }))
      .filter(r => r[1] === ctx.userConfig.name && r[3] !== 'Done' && r[3] !== 'Scheduled');

    if (!tasks.length) return ctx.reply('Задач нет. Чисто! ✨');

    const buttons = tasks.map(t => [Markup.button.callback(`▫️ ${t[2]}`, `task_manage_${t.index}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'open_tasks')]); // Возврат в меню задач

    const m = await ctx.reply('Выбери задачу:', Markup.inlineKeyboard(buttons));
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async manage(ctx) {
    const rowIndex = ctx.match[1];
    const rows = await google.getSheetData('Inbox', `C${rowIndex}:C${rowIndex}`);
    const text = rows[0]?.[0] || '???';

    state.set(ctx.from.id, { currentTaskRow: rowIndex, currentTaskText: text });

    await ctx.deleteMessage(); // Удаляем список
    const m = await ctx.reply(`📌 "${text}"\nЧто делаем?`, Markup.inlineKeyboard([
      [Markup.button.callback('✅ Выполнено', 'task_done')],
      [Markup.button.callback('📅 В план', 'task_plan')],
      [Markup.button.callback('🔙 Назад', 'task_list')] // Возврат к списку
    ]));
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async done(ctx) {
    const s = state.get(ctx.from.id);
    if (!s || !s.currentTaskRow) return ctx.reply('Ошибка контекста', keyboards.MainMenu);

    await google.updateCell('Inbox', `D${s.currentTaskRow}`, 'Done');
    await clearChat(ctx); // Удаляем меню задачи
    ctx.reply(`✅ Выполнено: "${s.currentTaskText}"`, keyboards.MainMenu);
  },

  async startAdd(ctx) {
    await ctx.deleteMessage();
    state.set(ctx.from.id, { scene: 'TASK_ADD', msgs: [] });
    const m = await ctx.reply('Напиши задачу:', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    await google.appendRow('Inbox', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, ctx.message.text, 'New']);
    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply(`✅ Сохранено: "${ctx.message.text}"`);
  },
};