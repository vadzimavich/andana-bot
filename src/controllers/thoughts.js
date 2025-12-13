const google = require('../services/google');
const state = require('../state');
const keyboards = require('../keyboards');
const { clearChat } = require('../utils/helpers');

module.exports = {
  async start(ctx) {
    // УБРАЛИ лишнее удаление
    await clearChat(ctx);
    state.set(ctx.from.id, { scene: 'THOUGHT_ADD', msgs: [] });
    const m = await ctx.reply('💡 О чем думаешь?', keyboards.CancelButton);
    state.addMsgToDelete(ctx.from.id, m.message_id);
  },

  async handleText(ctx) {
    await google.appendRow('Thoughts', [new Date().toLocaleString('ru-RU'), ctx.userConfig.name, ctx.message.text]);
    await clearChat(ctx);
    state.clear(ctx.from.id);
    ctx.reply('✨ Мысль записана.');
  }
};