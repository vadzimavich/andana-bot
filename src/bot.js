const { Telegraf } = require('telegraf');
const express = require('express');
const config = require('./config');
const google = require('./services/google');
const state = require('./state');
const cronJobs = require('./cron');

const General = require('./controllers/general');
const Tasks = require('./controllers/tasks');
const Shopping = require('./controllers/shopping');
const Thoughts = require('./controllers/thoughts');
const Finance = require('./controllers/finance');
const Weight = require('./controllers/weight');
const Plan = require('./controllers/plan');
const Settings = require('./controllers/settings');
const Wishlist = require('./controllers/wishlist');

const path = require('path'); // Node standard lib

const bot = new Telegraf(config.TELEGRAM_TOKEN);
const app = express();

const isPrivate = (ctx) => ctx.chat.type === 'private';

// НАСТРОЙКА VIEW ENGINE
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// WEB ROUTES
app.get('/', (req, res) => res.send('AndanaBot Alive')); // Uptime

app.get('/wishlist/:filter?', async (req, res) => {
  try {
    const filterName = req.params.filter; // 'Андрей', 'Аня' или undefined

    // Читаем из таблицы
    // Структура в листе Wishlist: Date, User, Title, Link, Image, Status
    const rows = await google.getSheetData('Wishlist', 'A:F');

    // Преобразуем массив массивов в объекты
    const items = rows.slice(1).map(r => ({
      date: r[0]?.split(',')[0],
      user: r[1],
      title: r[2],
      url: r[3],
      img: r[4] || 'https://via.placeholder.com/300x200?text=No+Image',
      status: r[5]
    })).filter(item => item.status === 'Active'); // Показываем только активные

    // Фильтруем если надо
    const filtered = filterName
      ? items.filter(i => i.user === decodeURIComponent(filterName))
      : items;

    res.render('wishlist', { items: filtered });
  } catch (e) {
    console.error(e);
    res.send('Ошибка загрузки вишлиста');
  }
});

// TV WEBHOOK (Для будущего управления ТВ)
app.post('/webhook/tv', express.json(), (req, res) => {
  const { action, data } = req.body;
  console.log(`📺 TV Command received: ${action}`, data);
  // Тут в будущем можно отправлять MQTT сообщение или WebSocket в Home Assistant
  res.send({ status: 'ok', command: action });
});

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (config.USERS[userId]) {
    ctx.userConfig = config.USERS[userId];
    return next();
  }
  if (ctx.chat.id.toString() === config.CHAT_HQ_ID) return next();
});

// --- TOPIC ROUTER ---
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type === 'private' || ctx.message.text?.startsWith('/') || !ctx.message.message_thread_id) {
    if (ctx.message.text?.startsWith('/link')) return Settings.linkTopic(ctx);
    return next();
  }
  if (topicType === config.TOPICS.IDEAS) return Wishlist.handleTopicMessage(ctx);
  const topicId = ctx.message.message_thread_id;
  const topicType = Settings.getTopicType(topicId);

  if (!topicType) return next();

  if (topicType === config.TOPICS.EXPENSES) return Finance.handleTopicMessage(ctx);
  if (topicType === config.TOPICS.SHOPPING) return Shopping.handleTopicMessage(ctx);
  if (topicType === config.TOPICS.INBOX) return Tasks.handleTopicMessage(ctx);
  // if (topicType === config.TOPICS.IDEAS) return Thoughts.handleTopicMessage(ctx);
  if (topicType === config.TOPICS.WISHLIST) return Wishlist.handleTopicMessage(ctx);

  return next();
});

// --- MENU TRIGGERS ---
const trigger = (text, handler) => {
  bot.hears(text, async (ctx) => {
    // В темах удаление сообщения юзера (нажатие кнопки) может вызвать ошибку 400
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // Игнорируем
    }
    await handler(ctx);
  });
};

bot.hears('⚖️ Вес', (ctx) => {
  if (!isPrivate(ctx)) return ctx.reply('🔒 Взвешиваемся только в личке!');
  Weight.start(ctx);
});

trigger('❓ Помощь', General.help);
trigger('📊 Отчеты', General.reportMenu);
trigger('⚙️ Конфиг', Settings.menu);
trigger('📝 Задачи', Tasks.menu);
trigger('🛒 Покупки', Shopping.menu);
trigger('💸 Расходы', Finance.startSpent);
trigger('⚖️ Вес', Weight.start);
trigger('📝 В планы', Plan.start);
trigger('💡 Мысли', Thoughts.start);
trigger(['📅 Сегодня', '🗓 Завтра'], General.schedule);
trigger('📋 Меню темы', async (ctx) => {
  const topicId = ctx.message.message_thread_id;
  const type = Settings.getTopicType(topicId);

  let text = "Добро пожаловать в тему!";
  let buttons = [];

  if (type === 'expenses') {
    text = "💸 *Тема: Расходы*\n\n• Просто пиши число (напр. 25.5)\n• Пиши число и категорию (25 еда)\n• Скидывай фото чека или QR\n• Команда /undo удалит последнюю запись";
    buttons = [[Markup.button.callback('📊 Отчет за месяц', 'rep_finance')]];
  }

  if (type === 'shopping') {
    text = "🛒 *Тема: Покупки*\n\n• Пиши товары через запятую\n• Команда /undo удалит последний товар";
    buttons = [[Markup.button.callback('📋 Показать список', 'shop_list')]];
  }

  ctx.replyWithMarkdown(text, Markup.inlineKeyboard(buttons));
});

bot.start(General.start);

// --- ACTIONS ---
bot.action('close_menu', async (ctx) => {
  try { await ctx.deleteMessage(); } catch (e) { }
  await ctx.answerCbQuery();
});

bot.action('cancel_scene', async (ctx) => {
  // Сначала говорим Телеграму "ОК", чтобы убрать часики загрузки
  await ctx.answerCbQuery('Отменено');

  const { clearChat } = require('./utils/helpers');

  // Явно удаляем сообщение, на котором нажали кнопку
  try { await ctx.deleteMessage(); } catch (e) { }

  // Чистим историю вопросов бота
  await clearChat(ctx);
});

bot.action('rep_fin_menu', Finance.reportMenu); // Меню месяцев
bot.action(/^rep_fin_(.+)/, async (ctx) => {
  const month = ctx.match[1];
  await Finance.generateReport(ctx, month);
});
bot.action('rep_weight', General.callWeightReport);

bot.action(/set_toggle_(.+)/, Settings.toggle);
bot.action(/set_ask_(.+)/, Settings.askTime);

bot.action('task_add', Tasks.startAdd);
bot.action('task_list', Tasks.list);
bot.action(/^task_manage_(\d+)$/, Tasks.manage);
bot.action('task_done', Tasks.done);
bot.action('task_plan', Plan.startFromTask);
bot.action('open_tasks', Tasks.menu);

bot.action('open_shopping', Shopping.menu);
bot.action('shop_add', Shopping.startAdd);
bot.action('shop_list', Shopping.list);
bot.action(/^shop_buy_(\d+)$/, Shopping.actionBuy);

bot.action(/^cat_(.+)/, Finance.actionCategory);
bot.command('models', Finance.debugModels);

bot.command('menu', async (ctx) => {
  // Если это личка - шлем главное меню
  if (ctx.chat.type === 'private') {
    return ctx.reply('Главное меню:', require('./keyboards').MainMenu);
  }

  // Если это тема
  const topicId = ctx.message.message_thread_id;
  const type = Settings.getTopicType(topicId);

  // Удаляем сообщение с командой /menu, чтобы не засорять чат
  try { await ctx.deleteMessage(); } catch (e) { }

  if (type === config.TOPICS.EXPENSES) return Finance.sendInterface(ctx);
  if (type === config.TOPICS.SHOPPING) return Shopping.sendInterface(ctx);
  if (type === config.TOPICS.INBOX) return Tasks.sendInterface(ctx); // <--- ВОТ ЭТОГО НЕ ХВАТАЛО
  if (type === config.TOPICS.WISHLIST) return Wishlist.sendInterface(ctx);

  return ctx.reply('⚠️ Эта тема не привязана. Используйте /link ...');
});

const handleUndo = async (ctx, sheetName, label) => {
  const success = await google.deleteLastRow(sheetName);
  const msg = success ? `🗑 Последняя запись в *${label}* удалена.` : `⚠️ ${label} пуст.`;
  await ctx.answerCbQuery(msg); // Всплывашка
  await ctx.replyWithMarkdown(msg); // Сообщение
};

bot.action('undo_finance', (ctx) => handleUndo(ctx, 'Finances', 'Расходах'));
bot.action('undo_shopping', (ctx) => handleUndo(ctx, 'Shopping', 'Покупках'));
bot.action('undo_task', (ctx) => handleUndo(ctx, 'Inbox', 'Задачах'));
bot.action('wishlist_undo', Wishlist.undo);

// --- TEXT ---
bot.on('text', async (ctx) => {
  const s = state.get(ctx.from.id);
  const scene = s?.scene;
  if (!scene) return;

  if (scene === 'WEIGHT' && !isPrivate(ctx)) {
    state.clear(ctx.from.id);
    return ctx.reply('🔒 Это только для личного чата.');
  }

  state.addMsgToDelete(ctx.from.id, ctx.message.message_id);

  if (scene === 'TASK_ADD') return Tasks.handleText(ctx);
  if (scene === 'SHOP_ADD') return Shopping.handleText(ctx);
  if (scene === 'THOUGHT_ADD') return Thoughts.handleText(ctx);
  if (scene === 'WEIGHT') return Weight.handleText(ctx);
  if (scene === 'SPENT_AMOUNT' || scene === 'SPENT_CATEGORY') return Finance.handleText(ctx);
  if (scene === 'PLAN_DATE' || scene === 'PLAN_DATE_FROM_TASK') return Plan.handleText(ctx);
  if (scene === 'SET_TIME') return Settings.handleText(ctx);
});

// --- STARTUP ---
(async () => {
  try {
    await Settings.init();
    cronJobs.init(bot);
    bot.launch().then(() => console.log('✅ AndanaBot V6 Running'));
    app.get('/', (req, res) => {
      res.send('AndanaBot is alive and watching you 👀');
    });
    app.listen(config.PORT, () => console.log(`🌍 Web Server running on port ${config.PORT}`));
  } catch (e) {
    console.error('❌ Startup failed:', e);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));