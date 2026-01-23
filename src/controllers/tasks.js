const { Markup } = require('telegraf');
const google = require('../services/google');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

// Хелпер для безопасного удаления
const safeDelete = async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (e) {
    // Игнорируем ошибку, если сообщения уже нет
  }
};

module.exports = {
  async menu(ctx) {
    await safeDelete(ctx);
    await clearChat(ctx);

    const rows = await google.getSheetData('Inbox', 'A:D'); // Date, User, Task, Status
    const userTasks = rows.filter(r =>
      r[1] === ctx.userConfig.name && // Только задачи текущего юзера
      r[3] !== 'Done' &&              // Не выполненные
      r[3] !== 'Scheduled'            // Не перенесенные в календарь
    );

    // Формируем текстовый список
    const taskListText = userTasks.length > 0
      ? userTasks.map(t => `▫️ ${t[2]}`).join('\n')
      : 'Задач нет. Чисто! ✨';

    const shopRows = await google.getSheetData('Shopping', 'D:D');
    const activeShopCount = shopRows.slice(1).filter(r => r[0] !== 'Done').length;
    const shopBtnText = activeShopCount > 0 ? `🛒 Покупки (${activeShopCount})` : '🛒 Покупки';

    ctx.reply(`👨‍🔧👩‍🏭 *Нужно сделать:*\n\n${taskListText}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Новая задача', 'task_add')],
        [Markup.button.callback('📂 Разгрести', 'task_list')],
        [Markup.button.callback(shopBtnText, 'open_shopping')],
        [Markup.button.callback('🔙 Отмена', 'close_menu')]
      ])
    });
  },

  async startAdd(ctx) {
    await safeDelete(ctx);
    state.set(ctx.from.id, { scene: 'TASK_ADD', msgs: [] });
    const m = await ctx.reply('Напиши задачу:', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    await google.appendRow('Inbox', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, ctx.message.text, 'New']);
    await clearChat(ctx);
    state.clear(ctx.from.id);

    // После добавления показываем обновленный список
    ctx.reply(`✅ Задача сохранена: "${ctx.message.text}"`);
    setTimeout(() => module.exports.menu(ctx), 500);
  },

  async list(ctx) {
    await safeDelete(ctx);

    const rows = await google.getSheetData('Inbox', 'A:D');
    const tasks = rows.map((r, i) => ({ ...r, index: i + 1 }))
      .filter(r => r[1] === ctx.userConfig.name && r[3] !== 'Done' && r[3] !== 'Scheduled');

    if (!tasks.length) {
      return module.exports.menu(ctx);
    }

    const buttons = tasks.map(t => [Markup.button.callback(`⚙️ ${t[2]}`, `task_manage_${t.index}`)]);
    buttons.push([Markup.button.callback('🔙 Назад', 'open_tasks')]);

    const m = await ctx.reply('Нажми на задачу, чтобы выполнить или запланировать:', Markup.inlineKeyboard(buttons));
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async manage(ctx) {
    const rowIndex = ctx.match[1];
    const rows = await google.getSheetData('Inbox', `C${rowIndex}:C${rowIndex}`);
    const text = rows[0]?.[0] || '???';

    state.set(ctx.from.id, { currentTaskRow: rowIndex, currentTaskText: text });

    // ВОТ ЗДЕСЬ БЫЛА ОШИБКА: Если safeDelete не использовался, бот падал
    await safeDelete(ctx);

    const m = await ctx.reply(`📌 "${text}"\nЧто делаем?`, Markup.inlineKeyboard([
      [Markup.button.callback('✅ Выполнено', 'task_done')],
      [Markup.button.callback('📅 В план', 'task_plan')],
      [Markup.button.callback('🔙 Назад', 'task_list')]
    ]));
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async done(ctx) {
    const s = state.get(ctx.from.id);
    if (!s || !s.currentTaskRow) return ctx.reply('Ошибка контекста', keyboards.MainMenu);

    await google.updateCell('Inbox', `D${s.currentTaskRow}`, 'Done');

    // Чистим чат от меню задачи
    await clearChat(ctx);

    // Уведомление и возврат к списку кнопок
    await ctx.reply(`✅ Выполнено: "${s.currentTaskText}"`);
    setTimeout(() => module.exports.list(ctx), 500);
  },

  async handleTopicMessage(ctx) {
    const text = ctx.message.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Inbox');
      return ctx.reply(success ? '🗑 Последняя задача удалена.' : '⚠️ Инбокс пуст.');
    }

    await google.appendRow('Inbox', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, text, 'New']);
    ctx.reply('📥 Сохранено в Инбокс');
  },
};