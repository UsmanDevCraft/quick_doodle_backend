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
        id: p.socketId,
        name: p.username,
        score: p.score,
        isHost: p.isHost,
      }));

    const saveTimeouts = {};

    // ✅ FIXED saveRoomToDB — added immediate saving option
    const saveRoomToDB = async (room, immediate = false) => {
      clearTimeout(saveTimeouts[room.roomId]);
      if (immediate) {
        try {
          await Room.findOneAndUpdate(
            { roomId: room.roomId },
            {
              $set: {
                roomId: room.roomId,
                host: room.host,
                currentWord: room.currentWord,
                currentRound: room.currentRound,
                players: room.players,
                rounds: room.rounds,
                chats: room.chats,
                isActive: room.isActive,
                createdAt: room.createdAt,
              },
            },
            { upsert: true }
          );
          console.log(`💾 Room ${room.roomId} immediately saved to DB`);
        } catch (err) {
          console.error("DB Save Error:", err);
        }
        return;
      }

      // fallback debounced save
      saveTimeouts[room.roomId] = setTimeout(async () => {
        try {
          await Room.findOneAndUpdate(
            { roomId: room.roomId },
            {
              $set: {
                roomId: room.roomId,
                host: room.host,
                currentWord: room.currentWord,
                currentRound: room.currentRound,
                players: room.players,
                rounds: room.rounds,
                chats: room.chats,
                isActive: room.isActive,
                createdAt: room.createdAt,
              },
            },
            { upsert: true }
          );
          console.log(`Room ${room.roomId} saved (debounced)`);
        } catch (err) {
          console.error("DB Save Error:", err);
        }
      }, 1000);
    };

    // ✅ FIXED loadRoomFromDB — players connected true (no forced disconnects)
    const loadRoomFromDB = async (roomId) => {
      const data = await Room.findOne({ roomId });
      if (data) {
        const room = data.toObject();
        delete room._id;
        delete room.__v;
        rooms[roomId] = {
          roomId: room.roomId,
          host: room.host,
          currentWord:
            room.currentWord || generate({ minLength: 4, maxLength: 10 }),
          currentRound: room.currentRound || 1,
          players: room.players.map((p) => ({
            socketId: p.socketId,
            username: p.username,
            score: p.score || 0,
            isHost: p.isHost || false,
            joinedAt: p.joinedAt || new Date(),
            connected: true, // ✅ FIXED (was false before)
          })),
          rounds: room.rounds || [
            {
              roundNumber: 1,
              word:
                room.currentWord || generate({ minLength: 4, maxLength: 10 }),
              riddler: room.host,
              guesses: [],
              startedAt: new Date(),
            },
          ],
          chats: room.chats || [],
          isActive: room.isActive !== false,
          createdAt: room.createdAt || new Date(),
        };
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
          host: username,
          currentWord: word,
          currentRound: 1,
          players: [
            {
              socketId: socket.id,
              username,
              score: 0,
              isHost: true,
              joinedAt: new Date(),
              connected: true,
            },
          ],
          rounds: [
            {
              roundNumber: 1,
              word,
              riddler: username,
              guesses: [],
              startedAt: new Date(),
            },
          ],
          chats: [],
          isActive: true,
          createdAt: new Date(),
        };

        await saveRoomToDB(rooms[roomId], true);

        socket.join(roomId);
        console.log(`${username} created room ${roomId} with word: ${word}`);

        socket.emit("roomInfo", {
          roomId,
          role: "riddler",
          word,
          wordLength: word.length,
          players: publicPlayers(rooms[roomId]),
          round: rooms[roomId].currentRound,
          riddler: username,
        });

        callback?.({ success: true, roomId });
      } catch (err) {
        console.error("createRoom error:", err);
        callback?.({ success: false, message: "server error" });
      }
    });

    // 🧍 JOIN ROOM
    socket.on("joinRoom", async ({ roomId, username } = {}, callback) => {
      try {
        if (!rooms[roomId]) {
          await loadRoomFromDB(roomId);
          if (!rooms[roomId])
            return callback?.({ success: false, message: "Room not found" });
        }

        const room = rooms[roomId];
        if (!Array.isArray(room.players)) room.players = [];

        let existingPlayer = room.players.find((p) => p.username === username);

        if (!existingPlayer) {
          const newPlayer = {
            socketId: socket.id,
            username,
            score: 0,
            isHost: false,
            joinedAt: new Date(),
            connected: true,
          };
          room.players.push(newPlayer);
          console.log(
            `✅ Added player ${username} to room ${roomId} — total: ${room.players.length}`
          );
        } else {
          existingPlayer.socketId = socket.id;
          existingPlayer.connected = true;
          console.log(`🔁 Player ${username} reconnected to room ${roomId}`);
        }

        socket.join(roomId);

        socket.emit("roomInfo", {
          roomId,
          role:
            room.rounds?.[room.currentRound - 1]?.riddler === username
              ? "riddler"
              : "player",
          word:
            room.rounds?.[room.currentRound - 1]?.riddler === username
              ? room.currentWord
              : null,
          wordLength: room.currentWord ? room.currentWord.length : 0,
          players: publicPlayers(room),
          round: room.currentRound,
          riddler: room.rounds?.[room.currentRound - 1]?.riddler || room.host,
        });

        // ✅ FIXED — broadcast after join and immediate DB save
        io.to(roomId).emit("updatePlayers", publicPlayers(room));
        await saveRoomToDB(room, true);

        callback?.({ success: true });
      } catch (err) {
        console.error("joinRoom error:", err);
        callback?.({ success: false, message: "server error" });
      }
    });

    // 🪄 REQUEST ROOM INFO
    socket.on("requestRoomInfo", async ({ roomId, username }) => {
      if (!rooms[roomId]) await loadRoomFromDB(roomId);
      const room = rooms[roomId];
      if (!room) return;

      socket.join(roomId);

      if (username) {
        if (!Array.isArray(room.players)) room.players = [];
        const existing = room.players.find((p) => p.username === username);
        if (existing) {
          existing.socketId = socket.id;
          existing.connected = true;
          console.log(
            `requestRoomInfo: marked ${username} connected for ${roomId}`
          );
        }
        io.to(roomId).emit("updatePlayers", publicPlayers(room));
        await saveRoomToDB(room, true);
      }

      const isRiddler =
        room.rounds[room.currentRound - 1]?.riddler === username;
      socket.emit("roomInfo", {
        roomId,
        role: isRiddler ? "riddler" : "guesser",
        word: isRiddler ? room.currentWord : null,
        wordLength: room.currentWord ? room.currentWord.length : 0,
        players: publicPlayers(room),
        riddler: room.rounds[room.currentRound - 1]?.riddler,
        round: room.currentRound,
      });

      (room.chats || []).forEach((msg) => {
        socket.emit("message", msg);
      });
    });

    // 💬 CHAT
    socket.on("chatMessage", async ({ roomId, username, text } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;

      const msg = {
        id: Date.now().toString(),
        player: username,
        text,
        isSystem: false,
        timestamp: new Date(),
      };

      room.chats.push(msg);
      io.to(roomId).emit("message", msg);
      await saveRoomToDB(room);
    });

    // 🎯 GUESS
    socket.on("guessWord", async ({ roomId, username, guess } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;

      const currentRound = room.rounds[room.currentRound - 1];
      const isCorrect =
        guess.trim().toLowerCase() === room.currentWord.toLowerCase();

      currentRound.guesses.push({
        player: username,
        guess,
        correct: isCorrect,
        timestamp: new Date(),
      });

      if (isCorrect) {
        const player = room.players.find((p) => p.username === username);
        if (player) {
          player.score += 10;
          currentRound.winner = username;
          currentRound.endedAt = new Date();
        }

        io.to(roomId).emit("winner", { username, word: room.currentWord });
        room.chats.push({
          id: Date.now().toString(),
          player: "System",
          text: `${username} guessed the word "${room.currentWord}"!`,
          isSystem: true,
          timestamp: new Date(),
        });

        io.to(roomId).emit("message", {
          id: Date.now().toString(),
          player: "System",
          text: `${username} guessed the word "${room.currentWord}"!`,
          isSystem: true,
          timestamp: Date.now(),
        });

        setTimeout(async () => {
          room.currentRound++;
          const riddlerIndex = room.players.findIndex(
            (p) => p.username === room.rounds[room.currentRound - 2]?.riddler
          );
          const nextRiddler =
            room.players[(riddlerIndex + 1) % room.players.length];

          room.currentWord = generate({ minLength: 4, maxLength: 10 });
          room.rounds.push({
            roundNumber: room.currentRound,
            word: room.currentWord,
            riddler: nextRiddler.username,
            guesses: [],
            startedAt: new Date(),
          });

          room.chats.push({
            id: Date.now().toString(),
            player: "System",
            text: `Round ${room.currentRound} started — ${nextRiddler.username} is the riddler!`,
            isSystem: true,
            timestamp: new Date(),
          });

          io.to(roomId).emit("newRound", {
            wordLength: room.currentWord.length,
            round: room.currentRound,
            riddler: nextRiddler.username,
          });

          io.to(nextRiddler.socketId).emit("roomInfo", {
            roomId,
            role: "riddler",
            word: room.currentWord,
            players: publicPlayers(room),
            round: room.currentRound,
          });

          io.to(roomId).emit("updatePlayers", publicPlayers(room));
          await saveRoomToDB(room, true);
        }, 2500);
      } else {
        room.chats.push({
          id: Date.now().toString(),
          player: username,
          text: guess,
          isSystem: false,
          timestamp: new Date(),
        });

        io.to(roomId).emit("message", {
          id: Date.now().toString(),
          player: username,
          text: guess,
          isSystem: false,
          timestamp: Date.now(),
        });
      }

      await saveRoomToDB(room);
    });

    // 🖊 Drawing
    socket.on("drawing", ({ roomId, data } = {}) => {
      socket.to(roomId).emit("drawing", data);
    });

    // ❌ DISCONNECT
    socket.on("disconnect", async () => {
      console.log("❌ Client disconnected:", socket.id);

      for (const [roomId, room] of Object.entries(rooms)) {
        const player = room.players.find((p) => p.socketId === socket.id);
        if (player) {
          player.connected = false;
          console.log(`${player.username} disconnected from room ${roomId}`);

          setTimeout(async () => {
            if (!player.connected) {
              const leftIndex = room.players.findIndex(
                (p) => p.socketId === socket.id
              );
              if (leftIndex !== -1) {
                const [left] = room.players.splice(leftIndex, 1);
                console.log(`${left.username} permanently left room ${roomId}`);

                room.chats.push({
                  id: Date.now().toString(),
                  player: "System",
                  text: `${left.username} left the room.`,
                  isSystem: true,
                  timestamp: new Date(),
                });

                io.to(roomId).emit("updatePlayers", publicPlayers(room));
                io.to(roomId).emit("message", {
                  id: Date.now().toString(),
                  player: "System",
                  text: `${left.username} left the room.`,
                  isSystem: true,
                  timestamp: Date.now(),
                });

                await saveRoomToDB(room, true);
              }
            }
          }, 30000);

          await saveRoomToDB(room, true);
          break;
        }
      }
    });
  });
}
