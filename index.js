import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import connectDB from "./config/database.js";
import dotenv from "dotenv";

import gameSocket from "./sockets/gameSocket.js";
import roomRoutes from "./routes/room.routes.js";

dotenv.config();
connectDB();

const app = express();

app.use(
  cors({
    origin: ["https://quick-doodle.vercel.app", "http://localhost:3001"],
    credentials: true,
  })
);

app.use(express.json());

app.use("/api", roomRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["https://quick-doodle.vercel.app", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

gameSocket(io);

app.get("/", (req, res) => {
  res.send("QuickDoodle Backend is running... 🙂");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
