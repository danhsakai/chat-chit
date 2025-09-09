const router = require("express").Router();
const { DB } = require("../db");
const jwt = require("jsonwebtoken");

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

// GET /api/rooms  -> liệt kê phòng, mặc định sort theo createdAt (mới nhất trước)
router.get("/", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    // Return only rooms that the user is a member of
    const membership = await r
      .table("roomMembers")
      .getAll(userId, { index: "userId" })
      .pluck("roomId")
      .coerceTo("array")
      .run(conn);
    const roomIds = membership.map((x) => x.roomId);
    if (!roomIds.length) return res.json([]);
    const cursor = await r
      .table("rooms")
      .getAll(r.args(roomIds))
      .orderBy(DB.r.desc("createdAt"))
      .run(conn);
    const rooms = await cursor.toArray();
    res.json(rooms);
  } catch (e) {
    next(e);
  }
});

// POST /api/rooms  -> tạo phòng mới
router.post("/", async (req, res, next) => {
  try {
    const { name, avatar, isPrivate } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = DB.r,
      conn = DB.conn;
    const creatorId = getUserIdFromAuth(req);
    const now = r.now();
    const doc = { name, createdAt: now, isPrivate: !!isPrivate };
    if (avatar !== undefined) doc.avatar = avatar;
    const result = await r.table("rooms").insert(doc).run(conn);

    // id tự sinh có trong generated_keys (theo driver JS của RethinkDB)
    const id = result.generated_keys ? result.generated_keys[0] : null;
    // If we know who created the room, set them as admin member (for group chats)
    if (id && creatorId) {
      try {
        await r
          .table("roomMembers")
          .insert(
            {
              id: `${creatorId}|${id}`,
              userId: creatorId,
              roomId: id,
              role: "admin",
              joinedAt: now,
            },
            { conflict: "update" }
          )
          .run(conn);
      } catch (_) {
        /* ignore membership errors */
      }
    }
    res.status(201).json({ id, inserted: result.inserted });
  } catch (e) {
    next(e);
  }
});

// GET /api/rooms/:id -> chi tiết phòng
router.get("/:id", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const room = await r.table("rooms").get(req.params.id).run(conn);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (e) {
    next(e);
  }
});

// GET /api/rooms/:id/members -> return member count inferred from userRooms
router.get("/:id/members", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const roomId = req.params.id;
    // Count distinct users that have a userRooms row for this room
    const cursor = await r
      .table("userRooms")
      .getAll(roomId, { index: "roomId" })
      .pluck("userId")
      .run(conn);
    const list = await cursor.toArray();
    const set = new Set(list.map((x) => x.userId));
    res.json({ memberCount: set.size });
  } catch (e) {
    next(e);
  }
});

// GET /api/rooms/:id/member-list -> list of members with roles (fallback to userRooms if none)
router.get("/:id/member-list", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const roomId = req.params.id;
    // Try explicit membership table first
    const memCur = await r
      .table("roomMembers")
      .filter({ roomId })
      .pluck("userId", "role")
      .run(conn);
    const memList = await memCur.toArray();
    if (memList.length > 0) return res.json(memList);
    // Fallback: infer from userRooms
    const urCur = await r
      .table("userRooms")
      .getAll(roomId, { index: "roomId" })
      .pluck("userId")
      .run(conn);
    const ur = await urCur.toArray();
    const set = new Set(ur.map((x) => x.userId));
    return res.json(
      Array.from(set).map((userId) => ({ userId, role: "member" }))
    );
  } catch (e) {
    next(e);
  }
});

// PUT /api/rooms/:id -> cập nhật thông tin phòng (tên/avatar/quyền riêng tư)
router.put("/:id", async (req, res, next) => {
  try {
    const { name, avatar, isPrivate } = req.body;
    if (!name && avatar === undefined && isPrivate === undefined)
      return res.status(400).json({ error: "nothing to update" });

    const r = DB.r,
      conn = DB.conn;
    const result = await r
      .table("rooms")
      .get(req.params.id)
      .update((row) => {
        const update = {};
        if (name) update.name = name;
        if (avatar !== undefined) update.avatar = avatar;
        if (isPrivate !== undefined) update.isPrivate = !!isPrivate;
        return update;
      })
      .run(conn);

    if (result.skipped || result.replaced === 0) {
      return res.status(404).json({ error: "Room not found or unchanged" });
    }
    res.json({ updated: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/rooms/:id -> xoá phòng
router.delete("/:id", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const result = await r.table("rooms").get(req.params.id).delete().run(conn);
    if (!result.deleted)
      return res.status(404).json({ error: "Room not found" });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/rooms/:id/join -> current user joins a public room
router.post("/:id/join", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const roomId = req.params.id;
    const room = await r.table("rooms").get(roomId).run(conn);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.isPrivate)
      return res.status(403).json({ error: "Cannot join a private room" });
    await r
      .table("roomMembers")
      .insert(
        {
          id: `${userId}|${roomId}`,
          userId,
          roomId,
          role: "member",
          joinedAt: r.now(),
        },
        { conflict: "update" }
      )
      .run(conn);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/rooms/:id/leave -> current user leaves a room
router.delete("/:id/leave", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const userId = getUserIdFromAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const roomId = req.params.id;
    await r.table("roomMembers").get(`${userId}|${roomId}`).delete().run(conn);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/rooms/:id/members -> add a member to the room
router.post("/:id/members", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const roomId = req.params.id;
    const { userId, role } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    // Only admin in a group chat can add members
    const me = getUserIdFromAuth(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const room = await r.table("rooms").get(roomId).run(conn);
    if (!room) return res.status(404).json({ error: "Room not found" });
    // Determine if this is a 1:1 DM (private with exactly 2 members)
    const memCur = await r
      .table("roomMembers")
      .getAll(roomId, { index: "roomId" })
      .run(conn);
    const memList = await memCur.toArray();
    const isDM = !!room.isPrivate && memList.length === 2;
    if (isDM)
      return res
        .status(403)
        .json({ error: "Cannot add members to a direct chat" });
    const meRole = memList.find((m) => m.userId === me)?.role || "member";
    if (meRole !== "admin")
      return res.status(403).json({ error: "Only admin can add members" });
    const id = `${userId}|${roomId}`;
    await r
      .table("roomMembers")
      .insert(
        { id, userId, roomId, role: role || "member", joinedAt: r.now() },
        { conflict: "update" }
      )
      .run(conn);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// PUT /api/rooms/:id/members/:userId -> update role for a member
router.put("/:id/members/:userId", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const roomId = req.params.id;
    const userId = req.params.userId;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ error: "role is required" });
    const me = getUserIdFromAuth(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const room = await r.table("rooms").get(roomId).run(conn);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const memCur = await r
      .table("roomMembers")
      .getAll(roomId, { index: "roomId" })
      .run(conn);
    const memList = await memCur.toArray();
    const isDM = !!room.isPrivate && memList.length === 2;
    if (isDM)
      return res.status(403).json({ error: "No roles in direct chats" });
    const meRole = memList.find((m) => m.userId === me)?.role || "member";
    if (meRole !== "admin")
      return res.status(403).json({ error: "Only admin can change roles" });
    // Enforce one admin only; limit vice roles to 3
    if (role === "vice") {
      const viceCount = memList.filter(
        (m) => m.role === "vice" && m.userId !== userId
      ).length;
      if (viceCount >= 3)
        return res.status(400).json({ error: "Vice limit reached" });
    }
    if (role === "admin") {
      // Transfer admin: set target to admin and demote current admin to member
      await r
        .table("roomMembers")
        .get(`${userId}|${roomId}`)
        .update({ role: "admin" })
        .run(conn);
      if (me !== userId) {
        await r
          .table("roomMembers")
          .get(`${me}|${roomId}`)
          .update({ role: "member" })
          .run(conn);
      }
      return res.json({ ok: true, transferred: me !== userId });
    }
    const id = `${userId}|${roomId}`;
    const result = await r
      .table("roomMembers")
      .get(id)
      .update({ role })
      .run(conn);
    if (!result.replaced && !result.unchanged)
      return res.status(404).json({ error: "member not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/rooms/:id/members/:userId -> remove member from room
router.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    const roomId = req.params.id;
    const userId = req.params.userId;
    const me = getUserIdFromAuth(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const room = await r.table("rooms").get(roomId).run(conn);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const memCur = await r
      .table("roomMembers")
      .getAll(roomId, { index: "roomId" })
      .run(conn);
    const memList = await memCur.toArray();
    const isDM = !!room.isPrivate && memList.length === 2;
    if (isDM)
      return res
        .status(403)
        .json({ error: "Cannot remove members in direct chats" });
    const meRole = memList.find((m) => m.userId === me)?.role || "member";
    if (meRole !== "admin")
      return res.status(403).json({ error: "Only admin can remove members" });
    const id = `${userId}|${roomId}`;
    await r.table("roomMembers").get(id).delete().run(conn);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/rooms/direct -> find or create a private room for current user and target user
router.post("/direct", async (req, res, next) => {
  try {
    const me = getUserIdFromAuth(req);
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const { targetId } = req.body || {};
    if (!targetId)
      return res.status(400).json({ error: "targetId is required" });
    const r = DB.r,
      conn = DB.conn;
    // Find an existing private room with exactly both users
    const candidateRoomIds = await r
      .table("roomMembers")
      .filter({ userId: me })
      .pluck("roomId")
      .coerceTo("array")
      .run(conn);
    const ids = Array.from(new Set(candidateRoomIds.map((x) => x.roomId)));
    let found = null;
    if (ids.length) {
      const cur = await r
        .table("roomMembers")
        .filter((row) => r.expr(ids).contains(row("roomId")))
        .group("roomId")
        .ungroup()
        .run(conn);
      const groups = await cur.toArray();
      for (const g of groups) {
        const users = new Set(g.reduction.map((x) => x.userId));
        if (users.size === 2 && users.has(me) && users.has(targetId)) {
          const rm = await r.table("rooms").get(g.group).run(conn);
          if (rm && rm.isPrivate) {
            found = rm;
            break;
          }
        }
      }
    }
    if (found) return res.json(found);
    // Create new private room
    const now = r.now();
    // Use target user's display name for the room name
    const targetUser = await r.table("users").get(targetId).run(conn);
    const displayName =
      targetUser && (targetUser.name || targetUser.username)
        ? targetUser.name || targetUser.username
        : targetId;
    const name = displayName;
    const ins = await r
      .table("rooms")
      .insert({ name, isPrivate: true, createdAt: now })
      .run(conn);
    const roomId = ins.generated_keys ? ins.generated_keys[0] : null;
    if (!roomId)
      return res.status(500).json({ error: "failed to create room" });
    await r
      .table("roomMembers")
      .insert([
        {
          id: `${me}|${roomId}`,
          userId: me,
          roomId,
          role: "member",
          joinedAt: now,
        },
        {
          id: `${targetId}|${roomId}`,
          userId: targetId,
          roomId,
          role: "member",
          joinedAt: now,
        },
      ])
      .run(conn);
    const created = await r.table("rooms").get(roomId).run(conn);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
