const { Markup } = require('telegraf');

const MainMenu = Markup.keyboard([
  ['📝 Задачи', '💡 Мысли'],
  ['📅 Сегодня', '🗓 Завтра', '📝 В планы'],
  ['💸 Расходы', '🛒 Покупки'],
  ['⚖️ Вес', '✅ Привычки'],
  ['⚙️ Конфиг', '📊 Отчеты', '❓ Помощь']
]).resize();

const CancelButton = Markup.inlineKeyboard([Markup.button.callback('🔙 Отмена', 'cancel_scene')]);

module.exports = { MainMenu, CancelButton };