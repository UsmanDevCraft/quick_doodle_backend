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
      console.log(
        `[joinGlobalRoom] request by ${username} - memory rooms: ${
          Object.keys(rooms).length
        }`
      );

      // 1️⃣ Try to find any active global room in memory
      let globalRoom = Object.values(rooms).find(
        (r) => r.mode === "global" && r.isActive
      );

      if (globalRoom) {
        console.log(
          `[joinGlobalRoom] found active global room in memory: ${globalRoom.roomId}`
        );
      } else {
        console.log(
          "[joinGlobalRoom] no active global room in memory, checking DB..."
        );
        // 2️⃣ If not in memory, try to load from DB
        // Use lean() to get a plain object; sort to get latest if needed
        const dbRoom = await Room.findOne({ mode: "global", isActive: true })
          .lean()
          .exec();
        if (dbRoom) {
          console.log(
            `[joinGlobalRoom] found dbRoom: ${dbRoom.roomId}, loading into memory...`
          );
          await loadRoomFromDB(rooms, dbRoom.roomId);
          globalRoom = rooms[dbRoom.roomId];
          if (globalRoom) {
            console.log(
              `[joinGlobalRoom] restored global room into memory: ${dbRoom.roomId}`
            );
          } else {
            console.warn(
              `[joinGlobalRoom] loadRoomFromDB didn't populate rooms[${dbRoom.roomId}]`
            );
          }
        } else {
          console.log("[joinGlobalRoom] no active global room found in DB");
        }
      }

      // 3️⃣ If still none, return failure (frontend shows modal)
      if (!globalRoom) {
        return callback?.({
          success: false,
          message: "No active global rooms available right now.",
        });
      }

      // Defensive check
      const roomId = globalRoom.roomId;
      const room = getRoom(rooms, roomId);
      if (!room) {
        console.error(
          `[joinGlobalRoom] inconsistent state: rooms[${roomId}] missing after restore`
        );
        return callback?.({
          success: false,
          message: "Server error: room restore failed.",
        });
      }

      // 4️⃣ Join the found global room (reuse joinRoom logic)
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
      } else {
        player.socketId = socket.id;
        player.connected = true;
      }

      socket.join(roomId);

      // Emit roomInfo and updatePlayers (same payload shape as joinRoom)
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
      callback?.({ success: true, roomId });
    } catch (err) {
      console.error("joinGlobalRoom error:", err);
      try {
        callback?.({ success: false, message: "Server error" });
      } catch (e) {
        console.error("joinGlobalRoom callback failed:", e);
      }
    }
  });
};
