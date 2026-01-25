const { Markup } = require('telegraf');
const axios = require('axios');

// URL твоего домашнего сервера (например, через Cloudflare Tunnel или Ngrok)
const TV_WEBHOOK_URL = process.env.TV_WEBHOOK_URL;

module.exports = {
  async sendInterface(ctx) {
    const text = `📺 *Пульт Google TV*\n\nВыберите действие:`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⏯ Play/Pause', 'tv_play'), Markup.button.callback('🔇 Mute', 'tv_mute')],
      [Markup.button.callback('🍿 YouTube', 'tv_app_yt'), Markup.button.callback('🎬 Кинопоиск', 'tv_app_kp')],
      [Markup.button.callback('🔌 Выключить', 'tv_power_off')]
    ]);
    await ctx.replyWithMarkdown(text, keyboard);
  },

  async handleAction(ctx) {
    const action = ctx.match[0];
    await ctx.answerCbQuery('Сигнал отправлен...');

    if (!TV_WEBHOOK_URL) {
      return ctx.reply('⚠️ Настрой TV_WEBHOOK_URL в переменных Render.');
    }

    try {
      await axios.post(TV_WEBHOOK_URL, {
        command: action,
        user: ctx.userConfig.name
      }, { timeout: 3000 });
      await ctx.reply(`✅ Команда ${action} выполнена`);
    } catch (e) {
      await ctx.reply(`❌ ТВ недоступен (Timeout)`);
    }
  }
};