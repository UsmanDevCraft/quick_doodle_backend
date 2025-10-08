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
    // CREATE ROOM
    socket.on("createRoom", ({ roomId, username }, callback) => {
      try {
        const word = generate({ minLength: 4, maxLength: 10 });

        rooms[roomId] = {
          roomId,
          word,
          round: 1,
          riddler: username,
          players: [
            {
              id: socket.id,
              name: username,
              score: 0,
              isHost: true,
            },
          ],
          scores: {},
        };

        socket.join(roomId);
        console.log(`${username} created room ${roomId} with word: ${word}`);

        // ✅ send riddler info only to the creator (immediate)
        socket.emit("roomInfo", {
          roomId,
          role: "riddler",
          word,
          wordLength: word.length,
          players: rooms[roomId].players,
          round: 1,
          riddler: username,
        });

        // ✅ re-emit after small delay to ensure FE listeners are ready
        setTimeout(() => {
          socket.emit("roomInfo", {
            roomId,
            role: "riddler",
            word,
            wordLength: word.length,
            players: rooms[roomId].players,
            round: 1,
            riddler: username,
          });
        }, 300);

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
          riddler: room.riddler,
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
        // ✅ Correct guess
        room.scores[username] = (room.scores?.[username] || 0) + 10;

        // update player's score in array
        const playerObj = room.players.find((p) => p.name === username);
        if (playerObj) playerObj.score = room.scores[username];

        io.to(roomId).emit("winner", { username, word: room.word });

        // ✅ rotate riddler to next player after a short delay
        setTimeout(() => {
          room.round = (room.round || 1) + 1;

          // find current riddler index (if not set, start from 0)
          const riddlerIndex = room.players.findIndex(
            (p) => p.name === room.riddler
          );
          const nextRiddlerIndex =
            riddlerIndex === -1 ? 0 : (riddlerIndex + 1) % room.players.length;

          // assign next riddler and new word
          const newRiddler = room.players[nextRiddlerIndex];
          room.riddler = newRiddler.name;
          room.word = generate({ minLength: 4, maxLength: 10 });

          // notify everyone that new round started
          io.to(roomId).emit("newRound", {
            wordLength: room.word.length,
            round: room.round,
            riddler: newRiddler.name,
          });

          // send the secret word only to riddler
          io.to(newRiddler.id).emit("roomInfo", {
            roomId,
            role: "riddler",
            word: room.word,
            wordLength: room.word.length,
            players: publicPlayers(room),
            round: room.round,
          });

          // broadcast updated players and scores
          io.to(roomId).emit("updatePlayers", publicPlayers(room));
        }, 2500);
      } else {
        // ❌ wrong guess
        socket.emit("wrongGuess", { guess, username });
        io.to(roomId).emit("message", {
          id: Date.now().toString(),
          player: username,
          text: guess,
          isSystem: false,
          timestamp: Date.now(),
        });
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
