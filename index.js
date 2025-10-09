import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import connectDB from "./config/database.js";
import dotenv from "dotenv";

import gameSocket from "./sockets/gameSocket.js";
dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// HTTP server wrapper (needed for sockets)
const server = http.createServer(app);

// Attach socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // later restrict to your frontend URL
    methods: ["GET", "POST"],
  },
});

// Use socket handlers
gameSocket(io);

app.get("/", (req, res) => {
  res.send("QuickDoodle Backend is running...");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
