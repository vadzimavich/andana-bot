const { Markup } = require('telegraf');

module.exports = {
  async handleMessage(ctx) {
    const text = ctx.message.text;

    // Например: "ютуб котики"
    if (text.toLowerCase().startsWith('ютуб')) {
      const query = text.replace('ютуб', '').trim();
      // В идеале: Отправляем вебхук в Home Assistant
      // axios.post('ТВОЙ_HA_URL/api/webhook/tv_play', { query });

      ctx.reply(`📺 Пытаюсь включить YouTube: ${query}\n(Нужен Home Assistant для исполнения)`);
    }
  },

  async sendInterface(ctx) {
    ctx.reply('📺 Пульт ТВ (заготовка)', Markup.inlineKeyboard([
      [Markup.button.callback('Netflix', 'tv_app_netflix'), Markup.button.callback('YouTube', 'tv_app_youtube')],
      [Markup.button.callback('⏯ Пауза/Плей', 'tv_key_play')]
    ]));
  }
};