const config = require('../config');
const google = require('./google');

// Хелпер для форматирования времени
const fmtTime = (date) => new Date(date).toLocaleTimeString('ru-RU', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Minsk'
});

/**
 * Генерирует отчет для команд /today и /tomorrow
 * @param {Date} targetDate 
 * @param {number} userId - ID пользователя, который запросил
 * @param {boolean} isPrivate - Личный ли это чат
 */
async function getDailyReport(targetDate, userId, isPrivate) {
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  // 1. Всегда берем Общий календарь
  const sharedEvents = await google.getEvents(config.CALENDAR_IDS.SHARED, start, end);

  let msg = `📅 *План на ${start.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}:*\n`;

  // Форматируем Общие
  if (sharedEvents.length > 0) {
    msg += `\n🏠 *Общее:*\n` + sharedEvents.map(e => {
      const time = e.start.date ? '📆 Весь день' : `🕒 ${fmtTime(e.start.dateTime)}`;
      return `${time} - ${e.summary}`;
    }).join('\n');
  } else {
    msg += `\n🏠 Общее: Пусто`;
  }

  // 2. Если это личный чат - добавляем личный календарь
  if (isPrivate) {
    // Определяем, чей календарь брать
    let personalCalId = null;
    if (userId === parseInt(process.env.ANDREY_ID)) personalCalId = config.CALENDAR_IDS.ANDREY;
    if (userId === parseInt(process.env.ANYA_ID)) personalCalId = config.CALENDAR_IDS.ANYA;

    if (personalCalId) {
      const personalEvents = await google.getEvents(personalCalId, start, end);
      if (personalEvents.length > 0) {
        msg += `\n\n👤 *Личное:*\n` + personalEvents.map(e => {
          const time = e.start.date ? '📆' : `🕒 ${fmtTime(e.start.dateTime)}`;
          return `${time} - ${e.summary}`;
        }).join('\n');
      } else {
        msg += `\n\n👤 Личное: Пусто`;
      }
    }
  }

  return msg;
}

/**
 * Специальный отчет для Утреннего Крона (в общий чат)
 * Показывает детали общих дел и КОЛИЧЕСТВО личных
 */
async function getMorningBriefing(targetDate) {
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  // Загружаем всё параллельно
  const [shared, andrey, anya] = await Promise.all([
    google.getEvents(config.CALENDAR_IDS.SHARED, start, end),
    google.getEvents(config.CALENDAR_IDS.ANDREY, start, end),
    google.getEvents(config.CALENDAR_IDS.ANYA, start, end)
  ]);

  let msg = `📅 *План на сегодня:*\n`;

  // 1. Общие - подробно
  if (shared.length > 0) {
    msg += shared.map(e => {
      const time = e.start.date ? '📆' : `🕒 ${fmtTime(e.start.dateTime)}`;
      return `• ${time} ${e.summary}`;
    }).join('\n');
  } else {
    msg += `• Общих дел нет`;
  }

  // 2. Личные - только счетчик
  msg += `\n\n👤 *Личные задачи:*`;
  msg += `\n👨‍💻 Андрей: ${andrey.length > 0 ? `${andrey.length} дел` : 'нет назначенных дел'}`;
  msg += `\n👩‍🎤 Аня: ${anya.length > 0 ? `${anya.length} дел` : 'нет назначенных дел'}`;

  return msg;
}

module.exports = { getDailyReport, getMorningBriefing };