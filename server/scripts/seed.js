// server/scripts/seed.js
const r = require("rethinkdb");

(async () => {
  const conn = await r.connect({ host: "localhost", port: 28015 });
  const dbName = "chatapp";
  const tables = ["users", "rooms", "messages"];

  // create db
  const dbs = await r.dbList().run(conn);
  if (!dbs.includes(dbName)) await r.dbCreate(dbName).run(conn);

  // create tables
  const tbs = await r.db(dbName).tableList().run(conn);
  for (const t of tables)
    if (!tbs.includes(t)) await r.db(dbName).tableCreate(t).run(conn);

  // indexes
  const idx = await r.db(dbName).table("messages").indexList().run(conn);
  if (!idx.includes("roomId_createdAt")) {
    await r
      .db(dbName)
      .table("messages")
      .indexCreate("roomId_createdAt", [r.row("roomId"), r.row("createdAt")])
      .run(conn);
    await r
      .db(dbName)
      .table("messages")
      .indexWait("roomId_createdAt")
      .run(conn);
  }
  console.log("Seed done");
  process.exit(0);
})();
