// server/db.js
const r = require("rethinkdb");

const DB = { conn: null, r, dbName: "chatapp" };

async function connect() {
  if (DB.conn) return DB.conn;
  DB.conn = await r.connect({ host: "localhost", port: 28015, db: DB.dbName });
  return DB.conn;
}

module.exports = { DB, connect };
