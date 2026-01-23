const { google } = require("googleapis");
const config = require("../config");

if (!config.GOOGLE_CREDS) {
  console.error("❌ FATAL: Google Credentials missing.");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: config.GOOGLE_CREDS,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const calendar = google.calendar({ version: "v3", auth });

// --- SHEETS ---

async function appendRow(sheetName, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: config.SHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [values] },
    });
    const updatedRange = res.data.updates.updatedRange;
    const match = updatedRange.match(/\d+$/);
    return match ? parseInt(match[0]) : null;
  } catch (error) {
    console.error(`Sheet Error [${sheetName}]:`, error.message);
    return null;
  }
}

async function getSheetData(sheetName, range) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: `${sheetName}!${range}`,
    });
    return res.data.values || [];
  } catch (error) {
    console.error(`Sheet Read Error [${sheetName}]:`, error.message);
    return [];
  }
}

// Обновление конкретной ячейки (например D5)
async function updateCell(sheetName, cell, value) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SHEET_ID,
      range: `${sheetName}!${cell}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [[value]] },
    });
    return true;
  } catch (error) {
    console.error(`Update Cell Error:`, error.message);
    return false;
  }
}

// НОВАЯ ФУНКЦИЯ: Перезапись целой строки
async function updateRow(sheetName, rowIndex, values) {
  try {
    // range: Лист!A5
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SHEET_ID,
      range: `${sheetName}!A${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [values] },
    });
    return true;
  } catch (error) {
    console.error(`Update Row Error:`, error.message);
    return false;
  }
}

// Удаление строки
async function deleteRow(sheetName, rowIndex) {
  try {
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: config.SHEET_ID,
    });
    const sheet = sheetMetadata.data.sheets.find(
      (s) => s.properties.title === sheetName
    );
    if (!sheet) return false;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.SHEET_ID,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });
    return true;
  } catch (error) {
    console.error(`Delete Row Error:`, error.message);
    return false;
  }
}

async function deleteLastRow(sheetName) {
  try {
    // Получаем данные, чтобы узнать кол-во строк
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: `${sheetName}!A:A`, // Читаем только первый столбец
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return false; // Пустой лист

    const lastRowIndex = rows.length; // Индекс последней строки (1-based)

    // Не удаляем заголовок (строка 1)
    if (lastRowIndex <= 1) return false;

    // Используем уже существующую deleteRow
    return await module.exports.deleteRow(sheetName, lastRowIndex - 1); // deleteRow принимает 0-based index для API batchUpdate? 
    // В моей реализации deleteRow выше (в прошлых ответах) мы использовали startIndex (0-based).
    // Если lastRowIndex = 5 (строка 5), то startIndex = 4.
  } catch (error) {
    console.error(`Undo Error [${sheetName}]:`, error.message);
    return false;
  }
}

// --- CALENDAR (Без изменений) ---
async function addEvent(calendarId, summary, dateObj, isAllDay = false) {
  const resource = { summary, description: "Created by AndanaBot" };
  if (isAllDay) {
    const dateStr = dateObj.toISOString().split("T")[0];
    resource.start = { date: dateStr };
    resource.end = { date: dateStr };
  } else {
    const startDateTime = dateObj.toISOString().replace("Z", "");
    const endObj = new Date(dateObj);
    endObj.setHours(endObj.getHours() + 1);
    const endDateTime = endObj.toISOString().replace("Z", "");
    resource.start = { dateTime: startDateTime, timeZone: "Europe/Minsk" };
    resource.end = { dateTime: endDateTime, timeZone: "Europe/Minsk" };
  }
  try {
    const res = await calendar.events.insert({ calendarId, resource });
    return res.data.id;
  } catch (error) {
    console.error("Calendar Add Error:", error.message);
    return null;
  }
}

async function getEvents(calendarId, timeMin, timeMax) {
  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: "Europe/Minsk",
    });
    return res.data.items || [];
  } catch (error) {
    return [];
  }
}

async function getSettingsJson() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID,
      range: "Settings!A1",
    });
    const jsonStr = res.data.values?.[0]?.[0];
    return jsonStr ? JSON.parse(jsonStr) : {};
  } catch (error) {
    console.error("Google Settings Read Error:", error.message);
    return {}; // Возвращаем пустой объект, если ошибка
  }
}

// Записываем JSON в ячейку A1 листа Settings
async function saveSettingsJson(data) {
  try {
    const jsonStr = JSON.stringify(data);
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SHEET_ID,
      range: "Settings!A1",
      valueInputOption: "RAW", // Важно: RAW, чтобы не парсил
      resource: { values: [[jsonStr]] },
    });
    return true;
  } catch (error) {
    console.error("Google Settings Save Error:", error.message);
    return false;
  }
}

module.exports = {
  appendRow,
  getSheetData,
  updateCell,
  updateRow,
  deleteRow,
  deleteLastRow,
  addEvent,
  getEvents,
  getSettingsJson,
  saveSettingsJson, // <-- Новые
};
