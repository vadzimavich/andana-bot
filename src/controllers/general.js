const Finance = require('./finance');
const Weight = require('./weight');
const reportService = require('../services/report');
const keyboards = require('../keyboards');
const { Markup } = require('telegraf');
const { clearChat } = require('../utils/helpers');

const checkPrivate = (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply('🔒 Только в личке.');
    return false;
  }
  return true;
};

module.exports = {
  async start(ctx) {
    await clearChat(ctx);
    ctx.reply(`Привет, ${ctx.userConfig.name}!`, keyboards.MainMenu);
  },

  async help(ctx) {
    await clearChat(ctx);
    const msg = `
🤖 *Гайд по Жорику v0.6:*

*📝 Ту Ду*
Сюда скидывай всё, что нужно сделать.
• _"Поменять лампочку"_ -> В Инбокс.
• В теме "Инбокс" просто пиши текст.

*💡 Мысли*
Минидневник. В теме "Мысли" пиши что угодно.

*🗓 Сегодня / Завтра*
Список дел из календаря.

*📅 В планы*
Создает события в Google Календаре.
• _"Врач завтра в 13:00"_

*💸 Расходы*
• В теме "Расходы": кидай фото чека или пиши сумму ("25 молоко").
• Кнопкой: выбери категорию.

*🛒 Покупки*
• В теме "Покупки": пиши список ("хлеб, сыр").
• Кнопкой: открой список и вычеркивай.

*⚖️ Вес*
Трекер веса (только в личке).

*⚙️ Конфиг*
Настройка времени уведомлений.

_Команды:_
/undo - Отменить последнее действие (в темах)
/link - Привязать тему (внутри темы)
`;
    await clearChat(ctx);
    ctx.replyWithMarkdown('🤖 Гайд...', keyboards.MainMenu);
  },

  async schedule(ctx) {
    await clearChat(ctx);
    const text = ctx.message.text;
    const isTomorrow = text.toLowerCase().includes('завтра');
    const targetDate = new Date();
    if (isTomorrow) targetDate.setDate(targetDate.getDate() + 1);

    ctx.reply('🔎 Загружаю план...');

    const msg = await reportService.getDailyReport(new Date(), ctx.from.id, ctx.chat.type === 'private');
    ctx.replyWithMarkdown(msg, keyboards.MainMenu);
  },

  async reportMenu(ctx) {
    await clearChat(ctx);
    const isPrivate = ctx.chat.type === 'private';
    const buttons = [];

    // Финансы ведут в подменю выбора месяца
    buttons.push([Markup.button.callback('💰 Финансы (Выбор месяца)', 'rep_fin_menu')]);

    if (isPrivate) {
      buttons.push([Markup.button.callback('⚖️ Вес (График)', 'rep_weight')]);
    }

    buttons.push([Markup.button.callback('🔙 Отмена', 'cancel_scene')]);
    ctx.reply('📊 Отчеты:', Markup.inlineKeyboard(buttons));
  },

  async callWeightReport(ctx) {
    if (!checkPrivate(ctx)) return;
    await Weight.report(ctx);
  }
};