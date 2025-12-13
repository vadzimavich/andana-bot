const google = require("../services/google");
const charts = require("../services/charts");
const state = require("../state");
const keyboards = require("../keyboards");
const { clearChat } = require("../utils/helpers");

module.exports = {
  async start(ctx) {
    await clearChat(ctx);
    state.set(ctx.from.id, { scene: "WEIGHT", msgs: [] });
    const m = await ctx.reply(
      "⚖️ Встань на весы и напиши цифру:",
      keyboards.CancelButton
    );
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    const text = ctx.message.text;
    const num = parseFloat(text.replace(",", "."));

    if (isNaN(num)) {
      const m = await ctx.reply("🔢 Нужно число (например 88.5)");
      state.addMsgToDelete(ctx.from.id, m.message_id);
      return;
    }

    const fullDate = new Date().toLocaleString("ru-RU");
    const todayDatePart = fullDate.split(",")[0]; // "14.12.2025"

    const rows = await google.getSheetData("Weight", "A:C");

    let rowIndexToUpdate = -1;

    // Ищем запись за сегодня (чтобы перезаписать)
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowDatePart = row[0].split(",")[0];
      const rowUser = row[1];

      if (rowDatePart === todayDatePart && rowUser === ctx.userConfig.name) {
        rowIndexToUpdate = i + 1;
        break;
      }
    }

    if (rowIndexToUpdate !== -1) {
      await google.updateRow("Weight", rowIndexToUpdate, [
        fullDate,
        ctx.userConfig.name,
        num,
      ]);
      await clearChat(ctx);
      ctx.reply(`⚖️ Вес обновлен: ${num} кг.`);
    } else {
      await google.appendRow("Weight", [fullDate, ctx.userConfig.name, num]);
      await clearChat(ctx);
      ctx.reply(`⚖️ Вес записан: ${num} кг.`);
    }
  },

  async report(ctx) {
    await clearChat(ctx);
    const m = await ctx.reply("⚖️ Строю график веса...");

    const rows = await google.getSheetData("Weight", "A:C");
    const userRows = rows.filter((r) => r[1] === ctx.userConfig.name);

    if (userRows.length < 2) {
      await ctx.deleteMessage(m.message_id);
      return ctx.reply("Мало данных для графика.");
    }

    // 1. Парсим данные в структуру { timestamp, weight }
    const parsedData = userRows
      .map((row) => {
        const [dateStr] = row[0].split(","); // "14.12.2025"
        const [day, month, year] = dateStr.split(".").map(Number);
        const dateObj = new Date(year, month - 1, day);
        const weight = parseFloat(row[2]?.replace(",", "."));
        return {
          date: dateObj,
          timestamp: dateObj.getTime(),
          weight: weight,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp); // Сортируем по времени

    // 2. Заполняем пропуски (Gap Filling)
    const labels = [];
    const data = [];

    if (parsedData.length > 0) {
      // Создаем Map для быстрого поиска веса по дате
      // Ключ: timestamp (полночь)
      const weightMap = new Map();
      parsedData.forEach((item) => weightMap.set(item.timestamp, item.weight));

      let currentDate = new Date(parsedData[0].date); // Начинаем с первой записи
      const lastDate = parsedData[parsedData.length - 1].date; // Заканчиваем последней

      // Цикл по дням
      while (currentDate <= lastDate) {
        // Формируем метку DD.MM
        const d = String(currentDate.getDate()).padStart(2, "0");
        const mo = String(currentDate.getMonth() + 1).padStart(2, "0");
        labels.push(`${d}.${mo}`);

        // Ищем данные
        const ts = currentDate.getTime();
        if (weightMap.has(ts)) {
          data.push(weightMap.get(ts));
        } else {
          data.push(null); // Пустое значение для графика (Chart.js соединит линией благодаря spanGaps: true)
        }

        // +1 день
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    const img = await charts.generateLineChart(
      labels,
      data,
      `Вес: ${ctx.userConfig.name}`
    );

    await ctx.deleteMessage(m.message_id);
    await ctx.replyWithPhoto({ source: img });
  },
  async getDailyStatus() {
    const rows = await google.getSheetData("Weight", "A:B"); // Нам нужны только Дата и Имя
    const todayStr = new Date().toLocaleString("ru-RU").split(",")[0];
    const usersDone = new Set();

    rows.forEach((row) => {
      // row[0] - Date, row[1] - User
      if (row[0]?.split(",")[0] === todayStr) {
        usersDone.add(row[1]);
      }
    });

    return usersDone;
  },
};
