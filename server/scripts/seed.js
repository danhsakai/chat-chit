// server/scripts/seed.js
const r = require("rethinkdb");
const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 150000; // reasonably strong without being too slow
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

(async () => {
  const reset =
    process.argv.includes("--reset") || process.env.SEED_RESET === "1";
  const conn = await r.connect({ host: "localhost", port: 28015 });
  const dbName = "chatapp";
  const db = r.db(dbName);
  // Base tables + new tables for uploads tracking and room memberships
  const tables = [
    "users",
    "rooms",
    "messages",
    "userRooms", // per-user lastReadAt state
    "uploads", // track uploaded files metadata for auditing/security
    "roomMembers", // explicit membership list (useful for private rooms/roles)
  ];

  // create db
  const dbs = await r.dbList().run(conn);
  if (!dbs.includes(dbName)) await r.dbCreate(dbName).run(conn);

  // create tables
  const tbs = await db.tableList().run(conn);
  for (const t of tables)
    if (!tbs.includes(t)) await db.tableCreate(t).run(conn);

  // indexes for messages
  const msgIdx = await db.table("messages").indexList().run(conn);
  if (!msgIdx.includes("roomId_createdAt")) {
    await db
      .table("messages")
      .indexCreate("roomId_createdAt", [r.row("roomId"), r.row("createdAt")])
      .run(conn);
    await db.table("messages").indexWait("roomId_createdAt").run(conn);
  }
  if (!msgIdx.includes("userId")) {
    await db.table("messages").indexCreate("userId").run(conn);
    await db.table("messages").indexWait("userId").run(conn);
  }
  if (!msgIdx.includes("clientId")) {
    await db.table("messages").indexCreate("clientId").run(conn);
    await db.table("messages").indexWait("clientId").run(conn);
  }
  // Optional standalone createdAt index for generic time-based queries
  if (!msgIdx.includes("createdAt")) {
    await db.table("messages").indexCreate("createdAt").run(conn);
    await db.table("messages").indexWait("createdAt").run(conn);
  }

  // index for rooms.createdAt (optional but recommended)
  const roomIdx = await db.table("rooms").indexList().run(conn);
  if (!roomIdx.includes("createdAt")) {
    await db.table("rooms").indexCreate("createdAt").run(conn);
    await db.table("rooms").indexWait("createdAt").run(conn);
  }
  // index for rooms.name for quick lookup/uniqueness checks
  if (!roomIdx.includes("name")) {
    await db.table("rooms").indexCreate("name").run(conn);
    await db.table("rooms").indexWait("name").run(conn);
  }

  // indexes for users
  const usersIdx = await db.table("users").indexList().run(conn);
  if (!usersIdx.includes("createdAt")) {
    await db.table("users").indexCreate("createdAt").run(conn);
    await db.table("users").indexWait("createdAt").run(conn);
  }

  // indexes for userRooms
  const urIdx = await db
    .table("userRooms")
    .indexList()
    .run(conn)
    .catch(() => []);
  if (!urIdx.includes("userId")) {
    await db.table("userRooms").indexCreate("userId").run(conn);
    await db.table("userRooms").indexWait("userId").run(conn);
  }
  if (!urIdx.includes("roomId")) {
    await db.table("userRooms").indexCreate("roomId").run(conn);
    await db.table("userRooms").indexWait("roomId").run(conn);
  }
  // composite for quick lookup by (userId, roomId)
  if (!urIdx.includes("userId_roomId")) {
    await db
      .table("userRooms")
      .indexCreate("userId_roomId", [r.row("userId"), r.row("roomId")])
      .run(conn);
    await db.table("userRooms").indexWait("userId_roomId").run(conn);
  }

  // indexes for uploads (new)
  const upIdx = await db
    .table("uploads")
    .indexList()
    .run(conn)
    .catch(() => []);
  if (!upIdx.includes("roomId")) {
    await db.table("uploads").indexCreate("roomId").run(conn);
    await db.table("uploads").indexWait("roomId").run(conn);
  }
  if (!upIdx.includes("userId")) {
    await db.table("uploads").indexCreate("userId").run(conn);
    await db.table("uploads").indexWait("userId").run(conn);
  }
  if (!upIdx.includes("createdAt")) {
    await db.table("uploads").indexCreate("createdAt").run(conn);
    await db.table("uploads").indexWait("createdAt").run(conn);
  }
  if (!upIdx.includes("roomId_createdAt")) {
    await db
      .table("uploads")
      .indexCreate("roomId_createdAt", [r.row("roomId"), r.row("createdAt")])
      .run(conn);
    await db.table("uploads").indexWait("roomId_createdAt").run(conn);
  }

  // indexes for roomMembers (new)
  const rmIdx = await db
    .table("roomMembers")
    .indexList()
    .run(conn)
    .catch(() => []);
  if (!rmIdx.includes("roomId")) {
    await db.table("roomMembers").indexCreate("roomId").run(conn);
    await db.table("roomMembers").indexWait("roomId").run(conn);
  }
  if (!rmIdx.includes("userId")) {
    await db.table("roomMembers").indexCreate("userId").run(conn);
    await db.table("roomMembers").indexWait("userId").run(conn);
  }
  if (!rmIdx.includes("roomId_userId")) {
    await db
      .table("roomMembers")
      .indexCreate("roomId_userId", [r.row("roomId"), r.row("userId")])
      .run(conn);
    await db.table("roomMembers").indexWait("roomId_userId").run(conn);
  }

  // Optionally clear old data only when explicitly requested
  if (reset) {
    await db.table("messages").delete().run(conn);
    await db.table("rooms").delete().run(conn);
    await db.table("users").delete().run(conn);
    await db.table("userRooms").delete().run(conn);
  }

  // Sample users
  const users = [
    (() => {
      const h = hashPassword("alice");
      return {
        id: "alice",
        username: "alice",
        avatar: "https://i.pravatar.cc/100?img=5",
        createdAt: r.now(),
        ...h,
      };
    })(),
    (() => {
      const h = hashPassword("bob");
      return {
        id: "bob",
        username: "bob",
        avatar: "https://i.pravatar.cc/100?img=6",
        createdAt: r.now(),
        ...h,
      };
    })(),
    (() => {
      const h = hashPassword("charlie");
      return {
        id: "charlie",
        username: "charlie",
        avatar: "https://i.pravatar.cc/100?img=7",
        createdAt: r.now(),
        ...h,
      };
    })(),
  ];
  const usersCount = await db.table("users").count().run(conn);
  if (reset || usersCount === 0) {
    await db.table("users").insert(users, { conflict: "replace" }).run(conn);
  }

  // Sample rooms with avatars
  const nowSec = Math.floor(Date.now() / 1000);
  const rooms = [
    {
      name: "General",
      avatar: "https://i.pravatar.cc/100?img=1",
      isPrivate: false,
      createdAt: r.epochTime(nowSec - 86400),
    },
    {
      name: "Dev Team",
      avatar: "https://i.pravatar.cc/100?img=2",
      isPrivate: true,
      createdAt: r.epochTime(nowSec - 43200),
    },
    {
      name: "Friends",
      avatar: "https://i.pravatar.cc/100?img=3",
      isPrivate: false,
      createdAt: r.epochTime(nowSec - 21600),
    },
  ];
  let createdRooms = [];
  const roomsCount = await db.table("rooms").count().run(conn);
  if (reset || roomsCount === 0) {
    const roomInsert = await db
      .table("rooms")
      .insert(rooms, { return_changes: true })
      .run(conn);
    createdRooms = roomInsert.changes.map((c) => ({
      id: c.new_val.id,
      ...c.new_val,
    }));
  } else {
    const cur = await db.table("rooms").run(conn);
    createdRooms = await cur.toArray();
  }

  const roomByName = Object.fromEntries(createdRooms.map((r) => [r.name, r]));

  // Sample messages per room (latest should be recent to show in UI)
  const msgs = [
    // General
    {
      roomId: roomByName["General"].id,
      userId: "alice",
      text: "Chào mừng đến với General!",
      createdAt: r.epochTime(nowSec - 7200),
      clientId: "seed1",
    },
    {
      roomId: roomByName["General"].id,
      userId: "bob",
      text: "Xin chào mọi người 👋",
      createdAt: r.epochTime(nowSec - 7100),
      clientId: "seed2",
    },
    {
      roomId: roomByName["General"].id,
      userId: "alice",
      text: "Hôm nay họp lúc 3h nhé.",
      createdAt: r.epochTime(nowSec - 3600),
      clientId: "seed3",
    },

    // Dev Team
    {
      roomId: roomByName["Dev Team"].id,
      userId: "charlie",
      text: "Đã merge PR #42.",
      createdAt: r.epochTime(nowSec - 5400),
      clientId: "seed4",
    },
    {
      roomId: roomByName["Dev Team"].id,
      userId: "alice",
      text: "Deploy staging thành công ✅",
      createdAt: r.epochTime(nowSec - 1800),
      clientId: "seed5",
    },

    // Friends
    {
      roomId: roomByName["Friends"].id,
      userId: "bob",
      text: "Cuối tuần đi xem phim không?",
      createdAt: r.epochTime(nowSec - 4000),
      clientId: "seed6",
    },
    {
      roomId: roomByName["Friends"].id,
      userId: "alice",
      text: "Tuyệt!",
      createdAt: r.epochTime(nowSec - 1200),
      clientId: "seed7",
    },
  ];
  const messagesCount = await db.table("messages").count().run(conn);
  if (reset || messagesCount === 0) {
    await db.table("messages").insert(msgs).run(conn);
  }

  // Seed userRooms lastReadAt different per user
  const now = r.now();
  const userRoomsCount = await db.table("userRooms").count().run(conn);
  if (reset || userRoomsCount === 0) {
    await db
      .table("userRooms")
      .insert(
        [
          // Alice read General 2h ago, Dev Team 1h ago, Friends now
          {
            id: `alice|${roomByName["General"].id}`,
            userId: "alice",
            roomId: roomByName["General"].id,
            lastReadAt: r.epochTime(nowSec - 7200),
          },
          {
            id: `alice|${roomByName["Dev Team"].id}`,
            userId: "alice",
            roomId: roomByName["Dev Team"].id,
            lastReadAt: r.epochTime(nowSec - 3600),
          },
          {
            id: `alice|${roomByName["Friends"].id}`,
            userId: "alice",
            roomId: roomByName["Friends"].id,
            lastReadAt: r.epochTime(nowSec - 60),
          },

          // Bob read General 30m ago, Dev Team 3h ago, Friends 20m ago
          {
            id: `bob|${roomByName["General"].id}`,
            userId: "bob",
            roomId: roomByName["General"].id,
            lastReadAt: r.epochTime(nowSec - 1800),
          },
          {
            id: `bob|${roomByName["Dev Team"].id}`,
            userId: "bob",
            roomId: roomByName["Dev Team"].id,
            lastReadAt: r.epochTime(nowSec - 10800),
          },
          {
            id: `bob|${roomByName["Friends"].id}`,
            userId: "bob",
            roomId: roomByName["Friends"].id,
            lastReadAt: r.epochTime(nowSec - 1200),
          },

          // Charlie read General never (missing -> will count all), Dev Team 10m ago, Friends 1d ago
          {
            id: `charlie|${roomByName["Dev Team"].id}`,
            userId: "charlie",
            roomId: roomByName["Dev Team"].id,
            lastReadAt: r.epochTime(nowSec - 600),
          },
          {
            id: `charlie|${roomByName["Friends"].id}`,
            userId: "charlie",
            roomId: roomByName["Friends"].id,
            lastReadAt: r.epochTime(nowSec - 86400),
          },
        ],
        { conflict: "replace" }
      )
      .run(conn);
  }

  // Seed roomMembers data for access control (no enforcement yet in API)
  const roomMembersCount = await db.table("roomMembers").count().run(conn);
  if (reset || roomMembersCount === 0) {
    const members = [];
    for (const rm of createdRooms) {
      // Everyone can access public rooms; for private rooms, limit to a subset
      if (rm.isPrivate) {
        members.push(
          {
            id: `alice|${rm.id}`,
            userId: "alice",
            roomId: rm.id,
            role: "owner",
            joinedAt: r.now(),
          },
          {
            id: `bob|${rm.id}`,
            userId: "bob",
            roomId: rm.id,
            role: "member",
            joinedAt: r.now(),
          }
        );
      } else {
        members.push(
          {
            id: `alice|${rm.id}`,
            userId: "alice",
            roomId: rm.id,
            role: "member",
            joinedAt: r.now(),
          },
          {
            id: `bob|${rm.id}`,
            userId: "bob",
            roomId: rm.id,
            role: "member",
            joinedAt: r.now(),
          },
          {
            id: `charlie|${rm.id}`,
            userId: "charlie",
            roomId: rm.id,
            role: "member",
            joinedAt: r.now(),
          }
        );
      }
    }
    await db
      .table("roomMembers")
      .insert(members, { conflict: "replace" })
      .run(conn);
  }

  console.log(
    `Seed done${
      reset ? " (reset)" : ""
    }. Users: alice/bob/charlie (password = same as username)`
  );
  process.exit(0);
})();
