const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { DB } = require("../db");

function getUserIdFromAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const SECRET = process.env.JWT_SECRET || "dev-secret";
    const payload = jwt.verify(token, SECRET);
    return payload.id;
  } catch (_) {
    return null;
  }
}

// GET /api/user-rooms -> unread counts and lastReadAt per room for current user
router.get("/", async (req, res, next) => {
  try {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const r = DB.r,
      conn = DB.conn;
    const roomsCursor = await r
      .table("rooms")
      .pluck("id", "createdAt")
      .run(conn);
    const rooms = await roomsCursor.toArray();

    // Load existing user-room states
    const statesCursor = await r
      .table("userRooms")
      .getAll(userId, { index: "userId" })
      .run(conn);
    const states = await statesCursor.toArray();
    const stateByRoom = Object.fromEntries(states.map((s) => [s.roomId, s]));

    const result = {};
    for (const room of rooms) {
      const st = stateByRoom[room.id];
      const lastReadAt = st?.lastReadAt || null; // null means never read
      let lowerBound;
      if (lastReadAt) lowerBound = lastReadAt;
      else lowerBound = r.minval;
      // Count only messages from others (exclude current user's own messages)
      const count = await r
        .table("messages")
        .between([room.id, lowerBound], [room.id, r.maxval], {
          index: "roomId_createdAt",
          leftBound: "open",
        })
        .filter(r.row("userId").ne(userId))
        .count()
        .run(conn);
      result[room.id] = { lastReadAt: lastReadAt || null, unread: count };
    }

    res.json(result);
  } catch (e) {
    next(e);
  }
});

// PUT /api/user-rooms/read -> mark a room as read now for current user
router.put("/read", async (req, res, next) => {
  try {
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { roomId } = req.body || {};
    if (!roomId) return res.status(400).json({ error: "roomId is required" });

    const r = DB.r,
      conn = DB.conn;
    const now = r.now();
    const id = `${userId}|${roomId}`;
    await r
      .table("userRooms")
      .insert({ id, userId, roomId, lastReadAt: now }, { conflict: "update" })
      .run(conn);
    res.json({ ok: true, lastReadAt: await now.toISO8601().run(conn) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
