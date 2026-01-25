const jsQR = require('jsqr');
const Jimp = require('jimp'); // Исправлено: заглавные буквы важны
const { parseIkassa, parseEplus } = require('../services/receiptParser');
const ai = require('../services/ai');
const google = require('../services/google');
const charts = require('../services/charts');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');
const { Markup } = require('telegraf');

module.exports = {

  async startSpent(ctx) {
    try { await ctx.deleteMessage(); } catch (e) { }
    await clearChat(ctx);
    state.set(ctx.from.id, { scene: 'SPENT_AMOUNT', msgs: [] });
    const m = await ctx.reply('💸 Сколько потрачено? (число):', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async debugModels(ctx) {
    const m = await ctx.reply('📡 Спрашиваю у Google доступные модели...');
    const list = await ai.getAvailableModels();
    try { await ctx.deleteMessage(m.message_id); } catch (e) { }
    await ctx.reply(`🤖 Ответ Google:\n\n${list}`);
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
        [Markup.button.callback('💅 Уход и красота', 'cat_Уход'), Markup.button.callback('💳 Платежи', 'cat_Платежи')],
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
  async reportMenu(ctx) {
    // Удаляем предыдущие сообщения, если нужно
    await clearChat(ctx);

    // Ищем доступные месяцы
    const rows = await google.getSheetData('Finances', 'A:A');
    const months = new Set();
    rows.forEach(r => {
      if (!r[0] || r[0] === 'Date') return;
      const [d, m, y] = r[0].split(',')[0].split('.');
      if (m && y) months.add(`${m}.${y}`);
    });

    const buttons = Array.from(months).slice(-5).map(m => [Markup.button.callback(m, `rep_fin_${m}`)]);

    // УБРАЛИ кнопку "Отмена", как ты просил.
    // Меню закроется само при выборе месяца (см. generateReport ниже)

    ctx.reply('📅 Выберите месяц:', Markup.inlineKeyboard(buttons));
  },

  async generateReport(ctx, monthStr) {
    // УДАЛЯЕМ МЕНЮ ВЫБОРА МЕСЯЦА
    try { await ctx.deleteMessage(); } catch (e) { }

    const m = await ctx.reply(`📊 Строю отчет за ${monthStr}...`);

    const rows = await google.getSheetData('Finances', 'A:D');
    const categoryTotals = {};
    let totalSum = 0;

    rows.forEach(row => {
      if (!row[0] || row[0] === 'Date') return;
      const datePart = row[0].split(',')[0];
      if (datePart.includes(monthStr)) {
        const amount = parseFloat(row[3]?.replace(',', '.') || 0);
        const cat = row[2] || 'Разное';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
        totalSum += amount;
      }
    });

    if (totalSum === 0) {
      await ctx.deleteMessage(m.message_id);
      return ctx.reply('Трат не найдено.');
    }

    const pieBuffer = await charts.generatePieChart(
      Object.keys(categoryTotals),
      Object.values(categoryTotals),
      `Расходы ${monthStr}`
    );

    let textReport = `💰 *Всего: ${totalSum.toFixed(2)} BYN*\n\n`;
    Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, sum]) => {
        const percent = ((sum / totalSum) * 100).toFixed(1);
        textReport += `• ${cat}: ${sum.toFixed(2)} BYN (${percent}%)\n`;
      });

    await ctx.deleteMessage(m.message_id);
    await ctx.replyWithPhoto({ source: pieBuffer }, { caption: textReport, parse_mode: 'Markdown' });
  },

  async handleTopicMessage(ctx) {
    const text = ctx.message.text || ctx.message.caption || '';
    const photo = ctx.message.photo;

    // 1. ФОТО (ЧЕК)
    if (photo) {
      const m = await ctx.reply('🔎 Ищу QR-код...');
      const fileId = photo[photo.length - 1].file_id;
      const link = await ctx.telegram.getFileLink(fileId);

      let qrData = null;
      try {
        const image = await Jimp.read(link.href);
        const qr = jsQR(image.bitmap.data, image.bitmap.width, image.bitmap.height);
        if (qr) qrData = qr.data;
      } catch (e) { console.log('QR Error:', e.message); }

      // Если QR найден
      if (qrData) {
        await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🔗 QR: ${qrData}\nЗапрашиваю данные...`);

        let result = null;

        // Сценарий 1: iKassa
        if (qrData.includes('ikassa.by')) {
          const ui = qrData.split('/').pop();
          result = await parseIkassa(ui);
        }
        // Сценарий 2: Euroopt (eplus.by)
        else if (qrData.includes('eplus.by')) {
          result = await parseEplus(qrData);
        }

        if (result && result.success) {
          await ctx.deleteMessage(m.message_id).catch(() => { });
          return this.saveParsedReceipt(ctx, result, result.source);
        } else if (result && !result.success) {
          await ctx.deleteMessage(m.message_id).catch(() => { });

          let msg = `❌ Не удалось загрузить чек.`;
          if (result.error === 'IP Blocked by Euroopt') {
            msg += `\nСервер бота заблокирован Еврооптом (защита от облаков). Введите сумму вручную.`;
          }
          return ctx.reply(msg);
        }
      }

      // Если дошли сюда -> используем AI
      try {
        const result = await ai.parseReceipt(link.href);
        await ctx.deleteMessage(m.message_id).catch(() => { });

        if (result && !result.error) {
          return this.saveParsedReceipt(ctx, result, 'Gemini AI');
        }
      } catch (e) { console.error('AI error:', e.message); }

      await ctx.deleteMessage(m.message_id).catch(() => { });
      return ctx.reply('😔 Не удалось распознать чек. Введите сумму текстом.');
    }

    // 2. ТЕКСТ ("25 молоко" или "молоко 25")
    // Регулярка ищет число в начале или в конце
    const matchStart = text.match(/^(\d+([.,]\d+)?)\s+(.*)/);
    const matchEnd = text.match(/(.*)\s+(\d+([.,]\d+)?)$/);

    if (matchStart || matchEnd) {
      const amountStr = matchStart ? matchStart[1] : matchEnd[2];
      const desc = matchStart ? matchStart[3] : matchEnd[1];
      const amount = parseFloat(amountStr.replace(',', '.'));

      // Спрашиваем у AI категорию
      const aiResult = await ai.categorizeText(desc);
      const category = aiResult?.category || 'Разное';

      await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, category, amount, desc]);
      return ctx.reply(`✅ ${amount} BYN -> ${category} (${desc})`);
    }

    // 3. ПРОСТО ЧИСЛО ("25")
    const simpleNum = parseFloat(text.replace(',', '.'));
    if (!isNaN(simpleNum) && !text.includes(' ')) {
      state.set(ctx.from.id, { scene: 'SPENT_CATEGORY', amount: simpleNum });
      return ctx.reply(`💸 ${simpleNum} BYN. Категория?`, Markup.inlineKeyboard([
        [Markup.button.callback('🍔 Еда', 'cat_Еда'), Markup.button.callback('🏠 Дом', 'cat_Дом')],
        [Markup.button.callback('🚌 Транспорт', 'cat_Транспорт'), Markup.button.callback('💊 Здоровье', 'cat_Здоровье')],
        [Markup.button.callback('🎉 Развлечения', 'cat_Развлечения'), Markup.button.callback('👗 Одежда', 'cat_Одежда')],
        [Markup.button.callback('💅 Уход', 'cat_Уход'), Markup.button.callback('💳 Платежи', 'cat_Платежи')],
        [Markup.button.callback('🍺 Алкоголь', 'cat_Алкоголь'), Markup.button.callback('📦 Другое', 'cat_Разное')]
      ]));
    }

    // 4. UNDO
    if (text === '/undo') {
      const success = await google.deleteLastRow('Finances');
      return ctx.reply(success ? '🗑 Последняя запись удалена.' : '⚠️ Нечего удалять.');
    }
  },

  // СОХРАНЕНИЕ В ТАБЛИЦУ
  async saveParsedReceipt(ctx, data, source) {
    let report = `🧾 *Чек обработан (${source}):*\n`;
    let totalSaved = 0;

    // Если источник iKassa, у нас нет категорий. Просим AI их расставить (пакетом)
    // Для экономии времени пока ставим "Еда" или "Разное", но в идеале можно прогнать названия через AI
    // В текущей версии ставим дефолт, чтобы было быстро.

    for (const item of data.items) {
      const cat = item.category || 'Еда';
      await google.appendRow('Finances', [
        new Date().toLocaleString('ru-RU'),
        ctx.userConfig.name,
        cat,
        item.sum,
        item.desc
      ]);
      report += `• ${cat}: ${item.sum} (${item.desc.slice(0, 20)})\n`;
      totalSaved += item.sum;
    }

    report += `\n💰 *Итого: ${data.total || totalSaved.toFixed(2)} BYN*`;
    return ctx.replyWithMarkdown(report);
  },

  async actionCategory(ctx) {
    const s = state.get(ctx.from.id);
    if (!s || s.scene !== 'SPENT_CATEGORY') return ctx.answerCbQuery('Устарело');
    const category = ctx.match[1];
    const amount = s.amount;

    await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, category, amount, s.comment || '']);

    // FIX CLEANUP: Удаляем сообщение с кнопками
    try { await ctx.deleteMessage(); } catch (e) { }
    await clearChat(ctx);

    ctx.reply(`✅ Расход: ${amount} BYN [${category}]`);
  },

  async sendInterface(ctx) {
    const text = `💸 *Управление Расходами*\n\n` +
      `🔹 *Как добавить:* \n` +
      `• Фото чека / QR\n` +
      `• Текст: _"25.5 молоко"_\n` +
      `• Число: _"25"_ (бот спросит категорию)\n\n` +
      `🔹 *Команды:*`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Отчет за месяц', 'rep_fin_menu')],
      [Markup.button.callback('🔙 Отменить последнее', 'undo_finance')] // Сделаем спец. экшен для этого
    ]);

    await ctx.replyWithMarkdown(text, keyboard);
  },
};