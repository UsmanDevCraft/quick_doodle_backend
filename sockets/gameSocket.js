import { v4 as uuidv4 } from "uuid";
import { generate } from "random-words";
import Room from "../models/Room.js";

let rooms = {}; // in-memory store

export default function gameSocket(io) {
  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    const getRoom = (roomId) => rooms[roomId];
    const publicPlayers = (room) =>
      room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.isHost,
      }));

    const saveTimeouts = {};

    const saveRoomToDB = async (room) => {
      clearTimeout(saveTimeouts[room.roomId]);
      saveTimeouts[room.roomId] = setTimeout(async () => {
        try {
          await Room.findOneAndUpdate(
            { roomId: room.roomId },
            {
              $set: {
                roomId: room.roomId,
                word: room.word,
                round: room.round,
                riddler: room.riddler,
                players: room.players,
                scores: room.scores,
              },
            },
            { upsert: true }
          );
        } catch (err) {
          console.error("DB Save Error:", err);
        }
      }, 1000); // waits 1s before writing
    };

    const loadRoomFromDB = async (roomId) => {
      const data = await Room.findOne({ roomId });
      if (data) {
        const clean = data.toObject();
        delete clean._id;
        delete clean.__v;
        rooms[roomId] = clean;
        console.log(`Room ${roomId} restored from DB`);
      }

      return rooms[roomId];
    };

    // 🏗 CREATE ROOM
    socket.on("createRoom", async ({ roomId, username }, callback) => {
      try {
        const word = generate({ minLength: 4, maxLength: 10 });
        rooms[roomId] = {
          roomId,
          word,
          round: 1,
          riddler: username,
          players: [{ id: socket.id, name: username, score: 0, isHost: true }],
          scores: {},
        };

        await saveRoomToDB(rooms[roomId]); // 🧩 save new room

        socket.join(roomId);
        console.log(`${username} created room ${roomId} with word: ${word}`);

        socket.emit("roomInfo", {
          roomId,
          role: "riddler",
          word,
          wordLength: word.length,
          players: rooms[roomId].players,
          round: 1,
          riddler: username,
        });

        setTimeout(() => {
          socket.emit("newRound", {
            wordLength: word.length,
            round: 1,
            riddler: username,
            word,
          });
        }, 300);

        callback?.({ success: true, roomId });
      } catch (err) {
        console.error("createRoom error:", err);
        callback?.({ success: false, message: "server error" });
      }
    });

    // 🧍 JOIN ROOM
    socket.on("joinRoom", async ({ roomId, username } = {}, callback) => {
      try {
        let room = getRoom(roomId);

        // 🔁 if not in memory, recover from DB
        if (!room) {
          room = await loadRoomFromDB(roomId);
          if (!room)
            return callback?.({ success: false, message: "Room not found" });
        }

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
          already.id = socket.id;
          already.name = username;
        }

        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);

        await saveRoomToDB(room); // 🧩 sync join to DB

        socket.emit("roomInfo", {
          roomId,
          role: "player",
          wordLength: room.word.length,
          players: publicPlayers(room),
          round: room.round,
          riddler: room.riddler,
        });

        io.to(roomId).emit("updatePlayers", publicPlayers(room));

        callback?.({ success: true });
      } catch (err) {
        console.error("joinRoom error:", err);
        callback?.({ success: false, message: "server error" });
      }
    });

    // 🪄 REQUEST ROOM INFO
    socket.on("requestRoomInfo", async ({ roomId, username }) => {
      let room = rooms[roomId] || (await loadRoomFromDB(roomId));
      if (!room) return;

      const isRiddler = room.riddler === username;
      socket.emit("roomInfo", {
        roomId,
        role: isRiddler ? "riddler" : "guesser",
        word: isRiddler ? room.word : null,
        wordLength: room.word.length,
        players: room.players,
        riddler: room.riddler,
        round: room.round,
      });
    });

    // 💬 CHAT
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

    // 🎯 GUESS
    socket.on("guessWord", async ({ roomId, username, guess } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;

      if (guess.trim().toLowerCase() === room.word.toLowerCase()) {
        room.scores[username] = (room.scores?.[username] || 0) + 10;

        const player = room.players.find((p) => p.name === username);
        if (player) player.score = room.scores[username];

        io.to(roomId).emit("winner", { username, word: room.word });

        setTimeout(async () => {
          room.round++;
          const riddlerIndex = room.players.findIndex(
            (p) => p.name === room.riddler
          );
          const nextRiddler =
            room.players[(riddlerIndex + 1) % room.players.length];

          room.riddler = nextRiddler.name;
          room.word = generate({ minLength: 4, maxLength: 10 });

          io.to(roomId).emit("newRound", {
            wordLength: room.word.length,
            round: room.round,
            riddler: nextRiddler.name,
          });

          io.to(nextRiddler.id).emit("roomInfo", {
            roomId,
            role: "riddler",
            word: room.word,
            players: publicPlayers(room),
            round: room.round,
          });

          io.to(roomId).emit("updatePlayers", publicPlayers(room));

          await saveRoomToDB(room); // 🧩 save after round
        }, 2500);
      } else {
        io.to(roomId).emit("message", {
          id: Date.now().toString(),
          player: username,
          text: guess,
          isSystem: false,
          timestamp: Date.now(),
        });
      }
    });

    // 🖊 Drawing
    socket.on("drawing", ({ roomId, data } = {}) => {
      socket.to(roomId).emit("drawing", data);
    });

    // ❌ DISCONNECT
    socket.on("disconnect", async () => {
      console.log("❌ Client disconnected:", socket.id);

      for (const [roomId, room] of Object.entries(rooms)) {
        const leftIndex = room.players.findIndex((p) => p.id === socket.id);
        if (leftIndex !== -1) {
          const [left] = room.players.splice(leftIndex, 1);
          console.log(`${left.name} left room ${roomId}`);

          delete room.scores[left.name];
          io.to(roomId).emit("updatePlayers", publicPlayers(room));

          if (room.players.length === 0) {
            await Room.deleteOne({ roomId }); // 🧩 cleanup DB too
            delete rooms[roomId];
            console.log(`Room ${roomId} removed (empty).`);
          } else {
            await saveRoomToDB(room); // 🧩 save updated players
          }
          break;
        }
      }
    });
  });
}
