// sockets/gameSocket.js
import { v4 as uuidv4 } from "uuid";
import { generate } from "random-words";

let rooms = {}; // in-memory store for now

export default function gameSocket(io) {
  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // Helper: find a room object
    const getRoom = (roomId) => rooms[roomId];

    // Helper: build public player list
    const publicPlayers = (room) =>
      room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
      }));

    // CREATE ROOM
    // payload can be { roomId?, username } - frontend should pass both ideally
    socket.on("createRoom", ({ roomId, username }, callback) => {
      try {
        const word = generate({ minLength: 4, maxLength: 10 });

        rooms[roomId] = {
          roomId,
          word,
          round: 1,
          players: [
            {
              id: socket.id,
              name: username,
              score: 0,
              isHost: true,
            },
          ],
        };

        socket.join(roomId);
        console.log(`${username} created room ${roomId} with word: ${word}`);

        // send riddler info only to the creator
        socket.emit("roomInfo", {
          roomId,
          role: "riddler",
          word,
          wordLength: word.length,
          players: rooms[roomId].players,
          round: 1,
        });

        if (typeof callback === "function") callback({ success: true, roomId });
      } catch (err) {
        console.error("createRoom error:", err);
        if (typeof callback === "function")
          callback({ success: false, message: "server error" });
      }
    });

    // JOIN ROOM
    socket.on("joinRoom", ({ roomId, username } = {}, callback) => {
      try {
        const room = getRoom(roomId);
        if (!room) {
          if (typeof callback === "function")
            callback({ success: false, message: "Room not found" });
          return;
        }

        // avoid duplicates: by socket.id or by name
        const already = room.players.find(
          (p) => p.id === socket.id || p.name === username
        );
        if (!already) {
          room.players.push({
            id: socket.id,
            name: username,
            score: 0,
            isHost: false,
          });
        } else {
          // if reconnect, update name/id (simple handling)
          already.id = socket.id;
          already.name = username;
        }

        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);

        // Send roomInfo to the joining socket (no secret word)
        socket.emit("roomInfo", {
          roomId,
          role: "player",
          wordLength: room.word.length,
          players: publicPlayers(room),
          round: room.round,
        });

        // Notify everyone about updated player list
        io.to(roomId).emit("updatePlayers", publicPlayers(room));

        if (typeof callback === "function") callback({ success: true });
      } catch (err) {
        console.error("joinRoom error:", err);
        if (typeof callback === "function")
          callback({ success: false, message: "server error" });
      }
    });

    // CHAT message (separate event for chat)
    socket.on("chatMessage", ({ roomId, username, text } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;
      const msg = {
        id: Date.now().toString(),
        player: username,
        text,
        isSystem: false,
        timestamp: Date.now(),
      };
      io.to(roomId).emit("message", msg);
    });

    // GUESS event (separate from chat)
    socket.on("guessWord", ({ roomId, username, guess } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;

      if (
        String(guess).trim().toLowerCase() === String(room.word).toLowerCase()
      ) {
        // correct guess
        room.scores[username] = (room.scores[username] || 0) + 10;

        // Also update player's score object in players array
        const playerObj = room.players.find((p) => p.name === username);
        if (playerObj) playerObj.score = room.scores[username];

        io.to(roomId).emit("winner", { username, word: room.word });

        // Start next round (simple: keep same riddler for now)
        setTimeout(() => {
          room.round = (room.round || 1) + 1;
          room.word = generate({ minLength: 4, maxLength: 10 });

          // notify everyone that new round started (players get wordLength only)
          io.to(roomId).emit("newRound", {
            wordLength: room.word.length,
            round: room.round,
          });

          // send secret word only to riddler's socket (find riddler socket by name)
          const riddlerObj = room.players.find((p) => p.name === room.riddler);
          if (riddlerObj) {
            io.to(riddlerObj.id).emit("roomInfo", {
              roomId,
              role: "riddler",
              word: room.word,
              wordLength: room.word.length,
              players: publicPlayers(room),
              round: room.round,
            });
          }

          // broadcast updated players (scores changed)
          io.to(roomId).emit("updatePlayers", publicPlayers(room));
        }, 2500);
      } else {
        // optional: notify guesser they are wrong (private), and broadcast the guess as chat as well
        socket.emit("wrongGuess", { guess, username });
        const msg = {
          id: Date.now().toString(),
          player: username,
          text: guess,
          isSystem: false,
          timestamp: Date.now(),
        };
        // broadcast guess as chat (you can decide whether to broadcast)
        io.to(roomId).emit("message", msg);
      }
    });

    // Drawing broadcast (left as-is)
    socket.on("drawing", ({ roomId, data } = {}) => {
      socket.to(roomId).emit("drawing", data);
    });

    // Disconnect - remove player from rooms and notify others
    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);

      // find the room and player that disconnected
      for (const [roomId, room] of Object.entries(rooms)) {
        const leftIndex = room.players.findIndex((p) => p.id === socket.id);
        if (leftIndex !== -1) {
          const [left] = room.players.splice(leftIndex, 1);
          console.log(`${left.name} left room ${roomId}`);

          // safely delete score if exists
          if (
            room.scores &&
            left?.name &&
            room.scores[left.name] !== undefined
          ) {
            delete room.scores[left.name];
          }

          // notify remaining players
          io.to(roomId).emit("updatePlayers", publicPlayers(room));

          // remove empty room
          if (room.players.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} removed (empty).`);
          }
          break; // stop after found
        }
      }
    });
  });
}
