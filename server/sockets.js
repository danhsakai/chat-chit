// server/sockets.js
const { DB } = require("./db");

module.exports = function registerSockets(io) {
  io.on("connection", (socket) => {
    // client join room logic
    socket.on("joinRoom", ({ roomId }) => {
      socket.join(roomId);
    });
  });

  // 1 changefeed cho toàn bộ messages, phát theo roomId
  (async () => {
    const r = DB.r;
    const feed = await r
      .table("messages")
      .changes({ includeInitial: false })
      .run(DB.conn);

    feed.each((err, change) => {
      if (err) return console.error(err);
      const newMsg = change.new_val;
      if (!newMsg) return;
      // phát tới các client đang ở room tương ứng
      io.to(newMsg.roomId).emit("message:created", newMsg);
    });
  })();
};
