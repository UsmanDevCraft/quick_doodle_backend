import { generate } from "random-words";
import {
  getRoom,
  publicPlayers,
  saveRoomToDB,
  loadRoomFromDB,
} from "./helpers.js";
import Room from "../models/Room.js";

export const setupRoomSocket = (io, socket, rooms, saveTimeouts) => {
  socket.on("createRoom", async ({ roomId, username, mode }, callback) => {
    try {
      const word = generate({ minLength: 4, maxLength: 10 });
      rooms[roomId] = {
        roomId,
        host: username,
        mode: mode || "private",
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

      await saveRoomToDB(rooms[roomId], saveTimeouts, true);

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

  socket.on("joinRoom", async ({ roomId, username } = {}, callback) => {
    try {
      if (!rooms[roomId]) {
        await loadRoomFromDB(rooms, roomId);
        if (!rooms[roomId])
          return callback?.({ success: false, message: "Room not found" });
      }

      const room = getRoom(rooms, roomId);
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

      io.to(roomId).emit("updatePlayers", publicPlayers(room));
      await saveRoomToDB(room, saveTimeouts, true);

      callback?.({ success: true });
    } catch (err) {
      console.error("joinRoom error:", err);
      callback?.({ success: false, message: "server error" });
    }
  });

  socket.on("requestRoomInfo", async ({ roomId, username }) => {
    if (!rooms[roomId]) await loadRoomFromDB(rooms, roomId);
    const room = getRoom(rooms, roomId);
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
      await saveRoomToDB(room, saveTimeouts, true);
    }

    const isRiddler = room.rounds[room.currentRound - 1]?.riddler === username;
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

  socket.on("checkRoom", async (roomId, callback) => {
    try {
      let room = rooms[roomId];

      if (!room) {
        await loadRoomFromDB(rooms, roomId);
        room = rooms[roomId];
      }

      if (!room) {
        return callback?.({ exists: false, message: "Room not found" });
      }

      if (!room.isActive) {
        return callback?.({
          exists: false,
          message: "Room is no longer active",
        });
      }

      callback?.({ exists: true, message: "Room is available" });
    } catch (err) {
      console.error("checkRoom error:", err);
      callback?.({ exists: false, message: "Server error" });
    }
  });

  socket.on("joinGlobalRoom", async ({ username }, callback) => {
    try {
      console.log(`[joinGlobalRoom] Request by ${username}`);

      const MAX_PLAYERS = 3;

      // 1️⃣ Step 1: Find available global room directly in DB
      const dbRoom = await Room.findOne({
        mode: "global",
        isActive: true,
        $where: `this.players.length < ${MAX_PLAYERS}`,
      })
        .sort({ updatedAt: 1 }) // pick oldest active one first (to fill evenly)
        .lean();

      let roomId, room;

      if (!dbRoom) {
        // 2️⃣ No available room found → optionally create one
        console.log("⚠️ No global room with space found in DB");

        // If you want to auto-create a new one instead of rejecting:
        // const newRoom = await createNewGlobalRoom();
        // roomId = newRoom.roomId;
        // rooms[roomId] = newRoom;
        // room = newRoom;

        return callback?.({
          success: false,
          message:
            "All global rooms are full or inactive. Please try again soon!",
        });
      }

      // 3️⃣ Check if room already in memory (load it)
      roomId = dbRoom.roomId;
      room = rooms[roomId];
      if (!room) {
        await loadRoomFromDB(rooms, roomId);
        room = rooms[roomId];
      }

      // 4️⃣ Join logic
      if (!Array.isArray(room.players)) room.players = [];

      let player = room.players.find((p) => p.username === username);
      if (!player) {
        player = {
          socketId: socket.id,
          username,
          score: 0,
          isHost: false,
          joinedAt: new Date(),
          connected: true,
        };
        room.players.push(player);
        console.log(`🌍 ${username} joined global room ${roomId}`);
      } else {
        player.socketId = socket.id;
        player.connected = true;
        console.log(`🔁 ${username} reconnected to global room ${roomId}`);
      }

      socket.join(roomId);

      // 5️⃣ Notify and sync
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

      io.to(roomId).emit("updatePlayers", publicPlayers(room));

      // 6️⃣ Persist back to DB
      await saveRoomToDB(room, saveTimeouts, true);

      callback?.({ success: true, roomId });
    } catch (err) {
      console.error("joinGlobalRoom error:", err);
      callback?.({ success: false, message: "Server error" });
    }
  });
};
