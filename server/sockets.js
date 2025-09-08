// server/sockets.js
const { DB } = require("./db");

module.exports = function registerSockets(io) {
  // Presence maps
  // roomId -> Set of socketIds currently joined
  const roomOnline = new Map();
  // socketId -> Set of roomIds this socket joined
  const socketRooms = new Map();

  function emitPresence(roomId) {
    const set = roomOnline.get(roomId);
    const onlineCount = set ? set.size : 0;
    io.to(roomId).emit("room:presence", { roomId, onlineCount });
  }

  io.on("connection", (socket) => {
    socketRooms.set(socket.id, new Set());

    // client join room logic (also track presence)
    socket.on("joinRoom", ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      const set = roomOnline.get(roomId) || new Set();
      set.add(socket.id);
      roomOnline.set(roomId, set);
      socketRooms.get(socket.id).add(roomId);
      emitPresence(roomId);
    });

    // allow clients to request current presence for a room
    socket.on("presence:get", ({ roomId }) => {
      if (!roomId) return;
      const set = roomOnline.get(roomId);
      const onlineCount = set ? set.size : 0;
      socket.emit("room:presence", { roomId, onlineCount });
    });

    // optional leave handling
    socket.on("leaveRoom", ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      const set = roomOnline.get(roomId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) roomOnline.delete(roomId);
        else roomOnline.set(roomId, set);
      }
      const sset = socketRooms.get(socket.id);
      if (sset) sset.delete(roomId);
      emitPresence(roomId);
    });

    socket.on("disconnect", () => {
      const sset = socketRooms.get(socket.id) || new Set();
      for (const roomId of sset) {
        const set = roomOnline.get(roomId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) roomOnline.delete(roomId);
          else roomOnline.set(roomId, set);
          emitPresence(roomId);
        }
      }
      socketRooms.delete(socket.id);
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
