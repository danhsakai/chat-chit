// server/routes/auth.js
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "dev-secret";

// Đăng ký tài khoản mới
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Thiếu username hoặc password" });
  const r = require("rethinkdb");
  const { DB } = require("../db");
  const existing = await r.table("users").get(username).run(DB.conn);
  if (existing) return res.status(409).json({ error: "Username đã tồn tại" });
  await r
    .table("users")
    .insert({ id: username, username, password })
    .run(DB.conn);
  const token = jwt.sign({ id: username }, SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: username, name: username } });
});

// Đăng nhập
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const r = require("rethinkdb");
  const { DB } = require("../db");
  const user = await r.table("users").get(username).run(DB.conn);
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Sai username hoặc password" });
  const token = jwt.sign({ id: username }, SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: username, name: username } });
});

// Lấy thông tin user từ token
router.get("/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing token" });
  const token = auth.slice(7);
  const jwt = require("jsonwebtoken");
  const SECRET = process.env.JWT_SECRET || "dev-secret";
  try {
    const payload = jwt.verify(token, SECRET);
    const r = require("rethinkdb");
    const { DB } = require("../db");
    const user = await r.table("users").get(payload.id).run(DB.conn);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: { id: user.id, name: user.username } });
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
