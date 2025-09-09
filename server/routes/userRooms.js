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

    const r = DB.r, conn = DB.conn;
    // Compute only for rooms the user is a member of
    const membership = await r
      .table("roomMembers")
      .getAll(userId, { index: "userId" })
      .pluck("roomId")
      .coerceTo("array")
      .run(conn);
    const roomIds = membership.map((x) => x.roomId);
    const statesCursor = await r
      .table("userRooms")
      .getAll(userId, { index: "userId" })
      .run(conn);
    const states = await statesCursor.toArray();
    const stateByRoom = Object.fromEntries(states.map((s) => [s.roomId, s]));

    const result = {};
    for (const roomId of roomIds) {
      const st = stateByRoom[roomId];
      const lastReadAt = st?.lastReadAt || null; // null means never read
      const lowerBound = lastReadAt ? lastReadAt : r.minval;
      const count = await r
        .table("messages")
        .between([roomId, lowerBound], [roomId, r.maxval], {
          index: "roomId_createdAt",
          leftBound: "open",
        })
        .filter(r.row("userId").ne(userId))
        .count()
        .run(conn);
      result[roomId] = { lastReadAt: lastReadAt || null, unread: count };
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

// GET /api/user-rooms/room/:roomId -> list of read states for all users in a room
router.get("/room/:roomId", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const { roomId } = req.params;
    const cursor = await r
      .table("userRooms")
      .getAll(roomId, { index: "roomId" })
      .pluck("userId", "lastReadAt")
      .run(conn);
    const list = await cursor.toArray();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
