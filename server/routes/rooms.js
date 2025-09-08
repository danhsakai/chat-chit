const router = require("express").Router();
const { DB } = require("../db");

// GET /api/rooms  -> liệt kê phòng, mặc định sort theo createdAt (mới nhất trước)
router.get("/", async (req, res, next) => {
  try {
    const r = DB.r,
      conn = DB.conn;
    // Nếu đã tạo secondary index 'createdAt', orderBy({index:'createdAt'}) sẽ nhanh hơn
    const cursor = await r
      .table("rooms")
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
    const { name, avatar } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const r = DB.r,
      conn = DB.conn;
    const now = r.now();
    const result = await r
      .table("rooms")
      .insert({ name, avatar, createdAt: now })
      .run(conn);

    // id tự sinh có trong generated_keys (theo driver JS của RethinkDB)
    const id = result.generated_keys ? result.generated_keys[0] : null;
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

// PUT /api/rooms/:id -> đổi tên phòng
router.put("/:id", async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    if (!name && !avatar)
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

module.exports = router;
