const router = require("express").Router();
const { DB } = require("../db");

// GET /api/users?ids=a,b,c -> return public profiles
router.get("/", async (req, res, next) => {
  try {
    const idsParam = req.query.ids || "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const r = DB.r, conn = DB.conn;
    let users = [];
    if (ids.length === 0) {
      users = [];
    } else if (ids.length === 1) {
      const u = await r.table("users").get(ids[0]).run(conn);
      if (u) users = [u];
    } else {
      const cursor = await r.table("users").getAll(DB.r.args(ids)).run(conn);
      users = await cursor.toArray();
    }
    const result = users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name || u.username,
      avatar: u.avatar || null,
    }));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

