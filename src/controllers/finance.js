const { Markup } = require('telegraf');
const google = require('../services/google');
const charts = require('../services/charts');
const ai = require('../services/ai'); // Подключаем AI
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

module.exports = {
  async startSpent(ctx) {
    // УБРАЛИ лишнее удаление
    await clearChat(ctx);
    state.set(ctx.from.id, { scene: 'SPENT_AMOUNT', msgs: [] });
    const m = await ctx.reply('💸 Сколько потрачено? (число):', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    const s = state.get(ctx.from.id);
    const text = ctx.message.text;
    const num = parseFloat(text.replace(',', '.'));

    if (s.scene === 'SPENT_AMOUNT') {
      if (isNaN(num)) {
        const m = await ctx.reply('🔢 Нужно число.');
        state.addMsgToDelete(ctx.from.id, m.message_id);
        return;
      }
      state.set(ctx.from.id, { scene: 'SPENT_CATEGORY', amount: num });

      const m = await ctx.reply(`Сумма: ${num} BYN. Категория?`, Markup.inlineKeyboard([
        [Markup.button.callback('🍔 Еда', 'cat_Еда'), Markup.button.callback('🏠 Дом', 'cat_Дом')],
        [Markup.button.callback('🚌 Транспорт', 'cat_Транспорт'), Markup.button.callback('💊 Здоровье', 'cat_Здоровье')],
        [Markup.button.callback('🎉 Развлечения', 'cat_Развлечения'), Markup.button.callback('👗 Одежда', 'cat_Одежда')],
        [Markup.button.callback('💅 Уход и красота', 'cat_Уход и красота'), Markup.button.callback('💳 Платежи', 'cat_Платежи')],
        [Markup.button.callback('🍺 Алкоголь', 'cat_Алкоголь'), Markup.button.callback('📦 Другое', 'cat_Разное')]
      ]));
      state.addMsgToDelete(ctx.from.id, m.message_id);
      return;
    }

    if (s.scene === 'SPENT_CATEGORY') {
      await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, 'Разное', s.amount, text]);
      await clearChat(ctx);
      ctx.reply(`✅ Расход: ${s.amount} BYN (${text})`);
    }
  },

  async actionCategory(ctx) {
    const s = state.get(ctx.from.id);
    if (!s || s.scene !== 'SPENT_CATEGORY') return ctx.answerCbQuery('Устарело');
    const category = ctx.match[1];
    const amount = s.amount;
    await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, category, amount, '']);
    await clearChat(ctx);
    ctx.reply(`✅ Расход: ${amount} BYN [${category}]`);
  },

  // --- ОТЧЕТЫ ---
  async report(ctx) {
    await clearChat(ctx);
    const m = await ctx.reply('📊 Анализирую финансы за текущий месяц...');

    const rows = await google.getSheetData('Finances', 'A:D');
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    const dailyTotals = {}; // { '1': 50, '2': 0, ... '31': 100 }
    const categoryTotals = {}; // { 'Еда': 500, 'Дом': 200 }
    let totalSum = 0;

    // Инициализируем дни
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) dailyTotals[i] = 0;

    rows.forEach(row => {
      if (!row[0] || row[0] === 'Date') return;
      const [datePart] = row[0].split(',');
      const [day, month, year] = datePart.split('.').map(Number);

      if (month - 1 === currentMonth && year === currentYear) {
        const amount = parseFloat(row[3]?.replace(',', '.') || 0);
        const cat = row[2] || 'Разное';

        dailyTotals[day] += amount;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
        totalSum += amount;
      }
    });

    if (totalSum === 0) {
      await ctx.deleteMessage(m.message_id);
      return ctx.reply('В этом месяце трат не найдено.');
    }

    // 1. Гистограмма по дням
    const barBuffer = await charts.generateBarChart(
      Object.keys(dailyTotals),
      Object.values(dailyTotals),
      'Траты по дням (BYN)'
    );

    // 2. Круговая по категориям
    const pieBuffer = await charts.generatePieChart(
      Object.keys(categoryTotals),
      Object.values(categoryTotals),
      'Структура расходов'
    );

    // 3. Текст
    let textReport = `💰 *Всего за месяц: ${totalSum.toFixed(2)} BYN*\n\n`;
    Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, sum]) => {
        textReport += `• ${cat}: ${sum.toFixed(2)} BYN\n`;
      });

    await ctx.deleteMessage(m.message_id);

    // Отправляем альбом (группу медиа) или по очереди
    await ctx.replyWithPhoto({ source: barBuffer });
    await ctx.replyWithPhoto({ source: pieBuffer }, { caption: textReport, parse_mode: 'Markdown' });
  },

  async handleTopicMessage(ctx) {
    const text = ctx.message.text;
    const photo = ctx.message.photo;

    // 1. UNDO
    if (text === '/undo') {
      const success = await google.deleteLastRow('Finances');
      return ctx.reply(success ? '🗑 Последняя запись удалена.' : '⚠️ Нечего удалять.');
    }

    // 2. ФОТО (ЧЕК)
    if (photo) {
      const m = await ctx.reply('🧾 Читаю чек...');
      const fileId = photo[photo.length - 1].file_id;
      const link = await ctx.telegram.getFileLink(fileId);

      const result = await ai.parseReceipt(link.href);
      await ctx.deleteMessage(m.message_id);

      if (!result || result.error || !result.items) {
        return ctx.reply('🤖 Не смог разобрать чек. Введите сумму вручную.');
      }

      let msg = `🧾 *Чек на ${result.total} BYN:*\n`;
      for (const item of result.items) {
        await google.appendRow('Finances', [
          new Date().toLocaleString('ru-RU'),
          ctx.userConfig.name,
          item.category || 'Разное',
          item.sum,
          item.desc
        ]);
        msg += `• ${item.category}: ${item.sum} (${item.desc})\n`;
      }
      return ctx.replyWithMarkdown(msg);
    }

    // 3. ТЕКСТ ("25 молоко" или "25")
    const match = text.match(/^(\d+([.,]\d+)?)\s*(.*)/);
    if (!match) return; // Не похоже на расход

    const amount = parseFloat(match[1].replace(',', '.'));
    const restText = match[3].trim();

    if (restText) {
      // Пытаемся угадать категорию через AI или по списку
      // Для скорости: если AI включен, можно спросить его, или просто записать в Разное с комментом
      // Давай запишем в "Разное" (или AI определит), а текст в коммент

      // Вариант с AI (если не жалко лимитов):
      const aiCat = await ai.categorizeText(restText);
      const cat = aiCat?.category || 'Разное';

      // Вариант простой:
      // const cat = 'Разное';

      await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, cat, amount, restText]);
      ctx.reply(`✅ ${amount} BYN -> ${cat} (${restText})`);
    } else {
      // Просто число -> Спрашиваем категорию (Инлайн в теме)
      state.set(ctx.from.id, { scene: 'SPENT_CATEGORY', amount: amount });
      ctx.reply(`💸 ${amount} BYN. Категория?`, Markup.inlineKeyboard([
        [Markup.button.callback('🍔 Еда', 'cat_Еда'), Markup.button.callback('🏠 Дом', 'cat_Дом')],
        [Markup.button.callback('🚌 Транспорт', 'cat_Транспорт'), Markup.button.callback('💊 Здоровье', 'cat_Здоровье')],
        [Markup.button.callback('🎉 Развлечения', 'cat_Развлечения'), Markup.button.callback('👗 Одежда', 'cat_Одежда')],
        [Markup.button.callback('💅 Уход и красота', 'cat_Уход и красота'), Markup.button.callback('💳 Платежи', 'cat_Платежи')],
        [Markup.button.callback('🍺 Алкоголь', 'cat_Алкоголь'), Markup.button.callback('📦 Другое', 'cat_Разное')]
      ]));
    }
  }
};