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
  const { roomId, userId, text, clientId } = req.body || {};
  if (!roomId || !userId) return res.status(400).json({ error: "roomId and userId are required" });
  const now = DB.r.now();
  const payload = { roomId, userId, createdAt: now };
  if (clientId) payload.clientId = clientId; // persist clientId for dedupe on client
  // trim text, allow empty or missing when attachments are present
  if (typeof text === 'string') {
    const trimmed = text.trim();
    if (trimmed) payload.text = trimmed;
  }
  // Optional attachment fields
  const { type, url, fileName, fileSize, mime, attachments } = req.body || {};
  if (type) payload.type = type;
  if (url) payload.url = url;
  if (fileName) payload.fileName = fileName;
  if (fileSize) payload.fileSize = fileSize;
  if (mime) payload.mime = mime;
  if (Array.isArray(attachments) && attachments.length) {
    // Sanitize attachments to a safe subset of fields
    payload.attachments = attachments.map((a) => ({
      type: a?.type,
      url: a?.url,
      fileName: a?.fileName,
      fileSize: a?.fileSize,
      mime: a?.mime,
    })).filter((a) => a && a.url);
  }

  if (!payload.text && !payload.url && !(payload.attachments && payload.attachments.length)) {
    return res.status(400).json({ error: "Message must have text or attachment(s)" });
  }

  const result = await DB.r.table("messages").insert(payload).run(DB.conn);
  res.json({ inserted: result.inserted });
});

module.exports = router;
