// server/routes/auth.js
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const SECRET = process.env.JWT_SECRET || "dev-secret";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 150000;
  const keylen = 32;
  const digest = "sha256";
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, keylen, digest)
    .toString("hex");
  return {
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgo: `pbkdf2:${digest}:${iterations}:${keylen}`,
  };
}

function verifyPassword(password, user) {
  if (!user) return false;
  if (user.passwordHash && user.passwordSalt) {
    // parse algo or default
    const parts = String(user.passwordAlgo || "pbkdf2:sha256:150000:32").split(":");
    const digest = parts[1] || "sha256";
    const iterations = Number(parts[2] || 150000);
    const keylen = Number(parts[3] || 32);
    const hash = crypto
      .pbkdf2Sync(password, user.passwordSalt, iterations, keylen, digest)
      .toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash));
  }
  // fallback to legacy plaintext (will migrate on success)
  if (typeof user.password === "string") {
    return user.password === password;
  }
  return false;
}

// Đăng ký tài khoản mới
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Thiếu username hoặc password" });
  const r = require("rethinkdb");
  const { DB } = require("../db");
  const existing = await r.table("users").get(username).run(DB.conn);
  if (existing) return res.status(409).json({ error: "Username đã tồn tại" });
  const pw = hashPassword(password);
  await r
    .table("users")
    .insert({ id: username, username, createdAt: r.now(), ...pw })
    .run(DB.conn);
  const token = jwt.sign({ id: username }, SECRET, { expiresIn: "7d" });
  // Fetch full profile
  const user = await r.table("users").get(username).run(DB.conn);
  res.json({ token, user: { id: username, name: user.username, avatar: user.avatar || null } });
});

// Đăng nhập
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const r = require("rethinkdb");
  const { DB } = require("../db");
  const user = await r.table("users").get(username).run(DB.conn);
  if (!user || !verifyPassword(password, user))
    return res.status(401).json({ error: "Sai username hoặc password" });

  // If user had legacy plaintext password, migrate to hashed representation
  if (!user.passwordHash || !user.passwordSalt) {
    const pw = hashPassword(password);
    await r
      .table("users")
      .get(username)
      .update({ ...pw })
      .run(DB.conn);
  }
  const token = jwt.sign({ id: username }, SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: username, name: user.username, avatar: user.avatar || null } });
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
    res.json({ user: { id: user.id, name: user.username, avatar: user.avatar || null } });
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
