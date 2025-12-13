// Простое in-memory хранилище
const userStates = {};

module.exports = {
  get: (userId) => userStates[userId],
  set: (userId, data) => { userStates[userId] = { ...userStates[userId], ...data }; },
  clear: (userId) => { delete userStates[userId]; },
  // Для очистки чата
  addMsgToDelete: (userId, msgId) => {
    if (!userStates[userId]) userStates[userId] = {};
    if (!userStates[userId].msgs) userStates[userId].msgs = [];
    userStates[userId].msgs.push(msgId);
  },
  getMsgsToDelete: (userId) => userStates[userId]?.msgs || []
};