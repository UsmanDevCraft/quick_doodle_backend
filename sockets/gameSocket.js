import { v4 as uuidv4 } from "uuid";

let rooms = {}; // in-memory store for now

export default function gameSocket(io) {
  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // Create Room
    socket.on("createRoom", (username, callback) => {
      const roomId = uuidv4();
      rooms[roomId] = { players: [username], roomId };
      socket.join(roomId);
      console.log(`${username} created room ${roomId}`);
      callback({ roomId });
    });

    // Join Room
    socket.on("joinRoom", ({ roomId, username }, callback) => {
      if (rooms[roomId]) {
        rooms[roomId].players.push(username);
        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);
        io.to(roomId).emit("updatePlayers", rooms[roomId].players);
        callback({ success: true });
      } else {
        callback({ success: false, message: "Room not found" });
      }
    });

    // Drawing broadcast
    socket.on("drawing", ({ roomId, data }) => {
      socket.to(roomId).emit("drawing", data);
    });

    // Chat/Guess messages
    socket.on("message", ({ roomId, username, text }) => {
      io.to(roomId).emit("message", { username, text });
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });
}
