const chrono = require('chrono-node');
const google = require('../services/google');
const config = require('../config');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

module.exports = {
  async start(ctx) {
    await clearChat(ctx);
    state.set(ctx.from.id, { scene: 'PLAN_DATE', msgs: [] });

    // Подсказываем, куда пойдет задача
    const dest = ctx.chat.type === 'private' ? 'личный' : 'общий';

    const m = await ctx.reply(`📝 Событие в *${dest}* календарь:\n(Напиши: "Кино завтра в 19:00")`, {
      parse_mode: 'Markdown',
      ...keyboards.CancelButton
    });
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async startFromTask(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }
    const s = state.get(ctx.from.id);
    if (!s || !s.currentTaskText) return ctx.reply('Ошибка контекста.');

    state.set(ctx.from.id, {
      scene: 'PLAN_DATE_FROM_TASK',
      msgs: [],
      taskRow: s.currentTaskRow,
      taskText: s.currentTaskText
    });

    // Определяем контекст по тому, где нажали кнопку. 
    // Но так как это callback, ctx.chat.type может быть групповым, если меню вызвали там.
    const dest = ctx.chat.type === 'private' ? 'личный' : 'общий';

    const m = await ctx.reply(`📅 Когда: "${s.taskText}"?\n(В *${dest}* календарь)`, {
      parse_mode: 'Markdown',
      ...keyboards.CancelButton
    });
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    const s = state.get(ctx.from.id);
    const text = ctx.message.text;

    const parsedResults = chrono.ru.parse(text);
    if (!parsedResults || !parsedResults.length) {
      const m = await ctx.reply('⚠️ Не понял дату. Попробуй: "Завтра в 14:00"');
      state.addMsgToDelete(ctx.from.id, m.message_id);
      return;
    }

    const result = parsedResults[0];
    const date = result.start.date();
    const isTimeCertain = result.start.isCertain('hour');

    let title = '';
    if (s.scene === 'PLAN_DATE_FROM_TASK') title = s.taskText;
    else title = text.replace(result.text, '').trim().replace(/^(в|на)\s+/i, '').trim() || 'Событие';

    // --- ЛОГИКА ВЫБОРА КАЛЕНДАРЯ ---
    let calId;
    if (ctx.chat.type === 'private') {
      // Личный чат -> Личный календарь
      calId = ctx.from.id === parseInt(process.env.ANDREY_ID)
        ? config.CALENDAR_IDS.ANDREY
        : config.CALENDAR_IDS.ANYA;
    } else {
      // Групповой чат -> Общий календарь
      calId = config.CALENDAR_IDS.SHARED;
    }

    const success = await google.addEvent(calId, title, date, !isTimeCertain);

    if (success) {
      if (s.scene === 'PLAN_DATE_FROM_TASK') {
        await google.updateCell('Inbox', `D${s.taskRow}`, 'Scheduled');
      }
      await clearChat(ctx);
      const dateStr = date.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', ...(isTimeCertain ? { hour: '2-digit', minute: '2-digit' } : {}) });

      const calName = ctx.chat.type === 'private' ? 'Личный' : 'Общий';
      ctx.reply(`✅ Запланировано (${calName}):\n"${title}"\n📅 ${dateStr}`);
    } else {
      ctx.reply('❌ Ошибка календаря.');
    }
  }
};