const jsQR = require('jsqr');
const Jimp = require('jimp'); // Исправлено: заглавные буквы важны
const { parseIkassa } = require('../services/receiptParser');
const ai = require('../services/ai');
const google = require('../services/google');
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
    const text = ctx.message.text || ctx.message.caption || '';
    const photo = ctx.message.photo;

    // 1. ЕСЛИ ЭТО ФОТО
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

      // --- ЛОГИКА QR ---
      if (qrData) {
        await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, '🔗 QR найден, запрашиваю iKassa...');

        // Извлекаем УИ (если это ссылка - берем конец, если просто текст - берем как есть)
        let ui = qrData.includes('/') ? qrData.split('/').pop() : qrData;

        const result = await parseIkassa(ui);

        if (result.success) {
          await ctx.deleteMessage(m.message_id).catch(() => { });
          return this.saveParsedReceipt(ctx, result, 'iKassa');
        } else {
          // Если сайт не парсится (твое требование)
          await ctx.deleteMessage(m.message_id).catch(() => { });
          return ctx.reply(`❌ QR УИ - ${result.ui}.\n${result.url} не найден`);
        }
      }

      // --- ЛОГИКА AI (если QR не найден) ---
      await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, '🤖 QR не найден. Подключаю ИИ...');
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

    // 2. ЕСЛИ ЭТО ТЕКСТ (12.5 пиво)
    const match = text.match(/^(\d+([.,]\d+)?)\s*(.*)/);
    if (match) {
      const amount = parseFloat(match[1].replace(',', '.'));
      const comment = match[3].trim();

      if (comment) {
        await google.appendRow('Finances', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, 'Разное', amount, comment]);
        return ctx.reply(`✅ Записано: ${amount} BYN [Разное] (${comment})`);
      } else {
        state.set(ctx.from.id, { scene: 'SPENT_CATEGORY', amount: amount });
        return ctx.reply(`💸 ${amount} BYN. Категория?`, Markup.inlineKeyboard([
          [Markup.button.callback('🍔 Еда', 'cat_Еда'), Markup.button.callback('🏠 Дом', 'cat_Дом')],
          [Markup.button.callback('🚌 Транспорт', 'cat_Транспорт'), Markup.button.callback('💊 Здоровье', 'cat_Здоровье')],
          [Markup.button.callback('🎉 Развлечения', 'cat_Развлечения'), Markup.button.callback('📦 Другое', 'cat_Разное')]
        ]));
      }
    }

    // Если это команда /undo
    if (text === '/undo') {
      const success = await google.deleteLastRow('Finances');
      return ctx.reply(success ? '🗑 Последняя запись удалена.' : '⚠️ Нечего удалять.');
    }
  },

  // СОХРАНЕНИЕ В ТАБЛИЦУ
  async saveParsedReceipt(ctx, data, source) {
    let report = `🧾 *Чек обработан (${source}):*\n`;
    let totalSaved = 0;

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
  }
};