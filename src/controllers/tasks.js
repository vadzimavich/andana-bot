const { Markup } = require('telegraf');
const google = require('../services/google');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

// Хелпер для безопасного удаления
const safeDelete = async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) { }
};

module.exports = {
  // 1. ПУЛЬТ УПРАВЛЕНИЯ (Вызывается через /menu)
  async sendInterface(ctx) {
    const rows = await google.getSheetData('Inbox', 'D:D');
    // Считаем активные задачи
    const count = rows.slice(1).filter(r => r[0] !== 'Done' && r[0] !== 'Scheduled').length;

    const text = `📝 *Инбокс (Задачи)*\n\n` +
      `Активных задач: *${count}*\n\n` +
      `🔹 *Действие:* Просто пиши задачу сюда.\n` +
      `🔹 *Управление:* Кнопки ниже.`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📂 Разгрести задачи', 'task_list')],
      [Markup.button.callback('🔙 Отменить последнюю', 'undo_task')]
    ]);

    await ctx.replyWithMarkdown(text, keyboard);
  },

  // 2. СПИСОК ЗАДАЧ (Поп-ап сообщение)
  async list(ctx) {
    // ВАЖНО: УБРАЛИ safeDelete(ctx). Не удаляем сообщение, из которого вызвали (Пульт).

    const rows = await google.getSheetData('Inbox', 'A:D');
    const tasks = rows.map((r, i) => ({ ...r, index: i + 1 }))
      .filter(r => r[1] === ctx.userConfig.name && r[3] !== 'Done' && r[3] !== 'Scheduled');

    if (!tasks.length) {
      return ctx.reply('Задач нет. Чисто! ✨', Markup.inlineKeyboard([
        [Markup.button.callback('❌ Закрыть', 'close_menu')]
      ]));
    }

    const buttons = tasks.map(t => [Markup.button.callback(`⚙️ ${t[2]}`, `task_manage_${t.index}`)]);

    // ВАЖНО: Кнопка "Закрыть список" вместо "Назад"
    buttons.push([Markup.button.callback('❌ Закрыть список', 'close_menu')]);

    const m = await ctx.reply('Нажми на задачу, чтобы выполнить или запланировать:', Markup.inlineKeyboard(buttons));
    // Не добавляем в state.addMsgToDelete, так как это временное сообщение
  },

  // 3. УПРАВЛЕНИЕ КОНКРЕТНОЙ ЗАДАЧЕЙ
  async manage(ctx) {
    const rowIndex = ctx.match[1];
    const rows = await google.getSheetData('Inbox', `C${rowIndex}:C${rowIndex}`);
    const text = rows[0]?.[0] || '???';

    state.set(ctx.from.id, { currentTaskRow: rowIndex, currentTaskText: text });

    // Тут удаляем список задач, чтобы заменить его на меню действий
    await safeDelete(ctx);

    const m = await ctx.reply(`📌 "${text}"\nЧто делаем?`, Markup.inlineKeyboard([
      [Markup.button.callback('✅ Выполнено', 'task_done')],
      [Markup.button.callback('📅 В план', 'task_plan')],
      [Markup.button.callback('🔙 Назад к списку', 'task_list')] // Возвращает список
    ]));
  },

  async done(ctx) {
    const s = state.get(ctx.from.id);
    if (!s || !s.currentTaskRow) return ctx.reply('Ошибка контекста', keyboards.MainMenu);

    await google.updateCell('Inbox', `D${s.currentTaskRow}`, 'Done');

    // Удаляем меню действий
    await safeDelete(ctx);

    // Показываем уведомление
    await ctx.answerCbQuery('Выполнено!');

    // Открываем список заново (обновленный)
    await module.exports.list(ctx);
  },

  // --- ЛОГИКА ДОБАВЛЕНИЯ ТЕКСТОМ (В ТЕМЕ) ---
  async handleTopicMessage(ctx) {
    const text = ctx.message.text;

    if (text === '/undo') {
      const success = await google.deleteLastRow('Inbox');
      return ctx.reply(success ? '🗑 Последняя задача удалена.' : '⚠️ Инбокс пуст.');
    }

    await google.appendRow('Inbox', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, text, 'New']);
    // Короткий ответ, чтобы не спамить
    ctx.reply('📥');
  },

  ///
  async menu(ctx) {
    // Можно оставить для совместимости с личкой
    await module.exports.list(ctx);
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