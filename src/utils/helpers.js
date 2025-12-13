const state = require('../state');

async function clearChat(ctx) {
  const userId = ctx.from.id;
  const msgs = state.getMsgsToDelete(userId);

  if (msgs && msgs.length) {
    for (const msgId of msgs.reverse()) {
      try { await ctx.deleteMessage(msgId); } catch (e) { }
    }
  }
  state.clear(userId);
}

module.exports = { clearChat };