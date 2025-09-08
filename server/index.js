// server/index.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { DB, connect } = require("./db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const msgRoutes = require("./routes/messages");
const registerSockets = require("./sockets");
const userRoomsRoutes = require("./routes/userRooms");
const usersRoutes = require("./routes/users");

(async () => {
  await connect();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/messages", msgRoutes);
  app.use("/api/user-rooms", userRoomsRoutes);
  app.use("/api/users", usersRoutes);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  registerSockets(io);

  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log("Server on :" + port));
})();
