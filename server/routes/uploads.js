const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Use raw body for binary uploads
router.use(express.raw({ type: (req) => true, limit: "25mb" }));

function sanitizeName(name) {
  return String(name || "upload")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .slice(0, 100);
}

router.put("/:roomId", async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const fname = sanitizeName(req.query.filename || req.headers["x-filename"]);
    const mime = req.headers["content-type"] || "application/octet-stream";
    const buf = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "");
    if (!roomId) return res.status(400).json({ error: "roomId required" });
    if (!fname) return res.status(400).json({ error: "filename required" });
    if (!buf.length) return res.status(400).json({ error: "empty body" });

    const uploadsDir = path.join(__dirname, "..", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const uniq = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const finalName = `${uniq}_${fname}`;
    const filePath = path.join(uploadsDir, finalName);
    fs.writeFileSync(filePath, buf);

    const url = `/uploads/${finalName}`;
    res.json({
      ok: true,
      url,
      fileName: fname,
      mime,
      size: buf.length,
      roomId,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

module.exports = router;
