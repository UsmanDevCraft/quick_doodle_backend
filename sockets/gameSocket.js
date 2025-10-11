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

    const saveRoomToDB = async (room) => {
      clearTimeout(saveTimeouts[room.roomId]);
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
                chats: room.chats, // Save chats to DB
                isActive: room.isActive,
                createdAt: room.createdAt,
              },
            },
            { upsert: true }
          );
          console.log(`Room ${room.roomId} saved to DB`);
        } catch (err) {
          console.error("DB Save Error:", err);
        }
      }, 1000); // Debounce save to DB
    };

    const loadRoomFromDB = async (roomId) => {
      const data = await Room.findOne({ roomId });
      if (data) {
        const room = data.toObject();
        delete room._id;
        delete room.__v;
        rooms[roomId] = {
          roomId: room.roomId,
          host: room.host,
          currentWord: room.currentWord,
          currentRound: room.currentRound,
          players: room.players.map((p) => ({
            socketId: p.socketId,
            username: p.username,
            score: p.score,
            isHost: p.isHost,
            joinedAt: p.joinedAt,
          })),
          rounds: room.rounds,
          chats: room.chats || [], // Load chats from DB
          isActive: room.isActive,
          createdAt: room.createdAt,
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
          chats: [], // Initialize chats array
          isActive: true,
          createdAt: new Date(),
        };

        await saveRoomToDB(rooms[roomId]);

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

        setTimeout(() => {
          socket.emit("newRound", {
            wordLength: word.length,
            round: rooms[roomId].currentRound,
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

        // 🔁 If not in memory, recover from DB
        if (!room) {
          room = await loadRoomFromDB(roomId);
          if (!room)
            return callback?.({ success: false, message: "Room not found" });
        }

        const already = room.players.find((p) => p.username === username);

        if (!already) {
          room.players.push({
            socketId: socket.id,
            username,
            score: 0,
            isHost: false,
            joinedAt: new Date(),
          });
        } else {
          already.socketId = socket.id; // Update socket ID if player rejoins
        }

        socket.join(roomId);
        console.log(`${username} joined room ${roomId}`);

        await saveRoomToDB(room);

        // Send room info and existing chat messages
        socket.emit("roomInfo", {
          roomId,
          role:
            room.rounds[room.currentRound - 1].riddler === username
              ? "riddler"
              : "player",
          wordLength: room.currentWord.length,
          players: publicPlayers(room),
          round: room.currentRound,
          riddler: room.rounds[room.currentRound - 1].riddler,
        });

        // Emit stored chat messages to the joining player
        room.chats.forEach((msg) => {
          socket.emit("message", {
            id: msg.id,
            player: msg.player,
            text: msg.text,
            isSystem: msg.isSystem,
            timestamp: msg.timestamp,
          });
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

      const isRiddler = room.rounds[room.currentRound - 1].riddler === username;
      socket.emit("roomInfo", {
        roomId,
        role: isRiddler ? "riddler" : "guesser",
        word: isRiddler ? room.currentWord : null,
        wordLength: room.currentWord.length,
        players: publicPlayers(room),
        riddler: room.rounds[room.currentRound - 1].riddler,
        round: room.currentRound,
      });

      // Emit stored chat messages
      room.chats.forEach((msg) => {
        socket.emit("message", {
          id: msg.id,
          player: msg.player,
          text: msg.text,
          isSystem: msg.isSystem,
          timestamp: msg.timestamp,
        });
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

      // Save chat message to room
      room.chats.push(msg);

      io.to(roomId).emit("message", msg);

      await saveRoomToDB(room); // Save chat to DB
    });

    // 🎯 GUESS
    socket.on("guessWord", async ({ roomId, username, guess } = {}) => {
      const room = getRoom(roomId);
      if (!room) return;

      const currentRound = room.rounds[room.currentRound - 1];
      const isCorrect =
        guess.trim().toLowerCase() === room.currentWord.toLowerCase();

      // Save guess to the current round
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

        // Add system message to chats
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
          // Start new round
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

          // Add system message for new round
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

          io.to(roomId).emit("message", {
            id: Date.now().toString(),
            player: "System",
            text: `Round ${room.currentRound} started — ${nextRiddler.username} is the riddler!`,
            isSystem: true,
            timestamp: Date.now(),
          });

          await saveRoomToDB(room);
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

      await saveRoomToDB(room); // Save guesses and chats
    });

    // 🖊 Drawing
    socket.on("drawing", ({ roomId, data } = {}) => {
      socket.to(roomId).emit("drawing", data);
    });

    // ❌ DISCONNECT
    socket.on("disconnect", async () => {
      console.log("❌ Client disconnected:", socket.id);

      for (const [roomId, room] of Object.entries(rooms)) {
        const leftIndex = room.players.findIndex(
          (p) => p.socketId === socket.id
        );
        if (leftIndex !== -1) {
          const [left] = room.players.splice(leftIndex, 1);
          console.log(`${left.username} left room ${roomId}`);

          // Add system message for player leaving
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

          await saveRoomToDB(room);
          break;
        }
      }
    });
  });
}
