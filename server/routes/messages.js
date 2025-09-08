// server/routes/messages.js
const router = require("express").Router();
const { DB } = require("../db");

// Lấy lịch sử tin nhắn theo room, phân trang theo createdAt
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { before } = req.query; // timestamp để phân trang ngược
  const r = DB.r;
  const conn = DB.conn;

  const upper = before ? r.epochTime(parseFloat(before)) : r.maxval;
  const result = await r
    .table("messages")
    .between([roomId, r.minval], [roomId, upper], {
      index: "roomId_createdAt",
      rightBound: "open",
    })
    .orderBy({ index: r.desc("roomId_createdAt") })
    .limit(50)
    .run(conn);

  const messages = await result.toArray();
  res.json(messages.reverse());
});

// Gửi tin nhắn (đồng thời DB changefeed sẽ đẩy realtime)
router.post("/", async (req, res) => {
  const { roomId, userId, text, clientId } = req.body;
  const now = DB.r.now();
  const payload = { roomId, userId, text, createdAt: now };
  if (clientId) payload.clientId = clientId; // persist clientId for dedupe on client
  const result = await DB.r.table("messages").insert(payload).run(DB.conn);
  res.json({ inserted: result.inserted });
});

module.exports = router;
