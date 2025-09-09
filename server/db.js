// server/db.js
const r = require("rethinkdb");

const DB = { conn: null, r, dbName: process.env.RETHINKDB_DB || "chatapp" };

async function connect() {
  if (DB.conn) return DB.conn;
  const host = process.env.RETHINKDB_HOST || "localhost";
  const port = Number(process.env.RETHINKDB_PORT || 28015);
  DB.conn = await r.connect({ host, port, db: DB.dbName });
  return DB.conn;
}

module.exports = { DB, connect };
