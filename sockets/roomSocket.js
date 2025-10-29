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
      // 🏠 Load room if not already in memory
      if (!rooms[roomId]) {
        await loadRoomFromDB(rooms, roomId);
        if (!rooms[roomId])
          return callback?.({ success: false, message: "Room not found" });
      }

      const room = getRoom(rooms, roomId);
      if (!Array.isArray(room.players)) room.players = [];

      // 🛡️ Convert banned array (from DB) to Set for fast lookup (once per load)
      if (Array.isArray(room.banned)) room.banned = new Set(room.banned);

      // 🛡️ Convert banned array (from DB) to Set for fast lookup (once per load)
      if (!room.banned) room.banned = new Set();
      else if (Array.isArray(room.banned)) room.banned = new Set(room.banned);

      // 🚫 Check if player is banned
      if (room.banned.has(username)) {
        console.log(`🚫 ${username} tried to join banned room ${roomId}`);
        return callback?.({
          success: false,
          message: "You are banned from this room.",
        });
      }

      // ✅ Add or reconnect player
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

      // 👇 join room and send initial data
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

      // 🧠 Save room (convert banned set back to array for DB)
      room.banned = Array.from(room.banned);
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

  socket.on("checkRoom", async ({ roomId, username }, callback) => {
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

      const userExists = room.players?.some(
        (p) => p.username.toLowerCase() === username.toLowerCase()
      );

      if (userExists) {
        return callback?.({
          exists: true,
          isUsernameExists: true,
          message: "Username already taken in this room",
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

  socket.on("leaveRoom", async ({ roomId, username }, callback) => {
    try {
      const room = rooms[roomId];
      if (!room)
        return callback?.({ success: false, message: "Room not found" });

      const playerIndex = room.players.findIndex(
        (p) => p.username === username
      );
      if (playerIndex === -1)
        return callback?.({ success: false, message: "Player not found" });

      const [left] = room.players.splice(playerIndex, 1);
      console.log(`${left.username} left room ${roomId} intentionally`);

      let systemMessage = `${left.username} left the room.`;

      // host reassignment
      if (left.isHost) {
        if (room.players.length > 0) {
          room.players[0].isHost = true;
          room.host = room.players[0].username;
          systemMessage += ` ${room.host} is now the host.`;
        } else {
          room.isActive = false;
          systemMessage += ` The room is now inactive.`;
        }
      }

      // riddler reassignment
      const currentRound = room.rounds[room.currentRound - 1];
      if (currentRound && currentRound.riddler === left.username) {
        if (room.players.length > 0) {
          currentRound.riddler = room.players[0].username;
          systemMessage += ` ${currentRound.riddler} is now the riddler.`;
        } else {
          console.log("🎭 No riddler left, room empty.");
        }
      }

      const msg = {
        id: Date.now().toString(),
        player: "System",
        text: systemMessage,
        isSystem: true,
        timestamp: new Date(),
      };

      room.chats.push(msg);
      io.to(roomId).emit("updatePlayers", publicPlayers(room));
      io.to(roomId).emit("message", msg);

      await saveRoomToDB(room, saveTimeouts, true);
      socket.leave(roomId);

      callback?.({ success: true });
    } catch (error) {
      console.error("leaveRoom error:", error);
      callback?.({ success: false, message: "Server error" });
    }
  });

  socket.on("voteKick", async ({ roomId, target, voter }, callback) => {
    try {
      const room = rooms[roomId];
      if (!room)
        return callback?.({ success: false, message: "Room not found" });

      // Cannot kick yourself
      if (target === voter)
        return callback?.({
          success: false,
          message: "You can't vote yourself",
        });

      // Player must exist
      const targetPlayer = room.players.find((p) => p.username === target);
      if (!targetPlayer)
        return callback?.({
          success: false,
          message: "Target player not found",
        });

      // Must be at least 3 players to enable vote kick
      if (room.players.length < 3)
        return callback?.({
          success: false,
          message: "Not enough players to vote kick",
        });

      if (!room.kickVotes) room.kickVotes = {};
      if (!room.banned) room.banned = new Set();

      // Initialize if not present
      if (!room.kickVotes[target]) room.kickVotes[target] = new Set();

      // Add vote
      room.kickVotes[target].add(voter);

      const totalPlayers = room.players.length;
      const votes = room.kickVotes[target].size;
      const requiredVotes = Math.ceil(totalPlayers * (2 / 3));

      console.log(
        `🗳️ ${voter} voted to kick ${target} (${votes}/${requiredVotes})`
      );

      // Broadcast progress to room
      io.to(roomId).emit("voteKickUpdate", {
        target,
        votes,
        requiredVotes,
      });

      // If threshold reached, kick the player
      if (votes >= requiredVotes) {
        const targetIndex = room.players.findIndex(
          (p) => p.username === target
        );
        const [kicked] = room.players.splice(targetIndex, 1);

        // Ban them from rejoining
        room.banned.add(target);

        const msg = {
          id: Date.now().toString(),
          player: "System",
          text: `${target} was kicked out of the room by majority vote.`,
          isSystem: true,
          timestamp: new Date(),
        };
        room.chats.push(msg);

        io.to(roomId).emit("updatePlayers", publicPlayers(room));
        io.to(roomId).emit("message", msg);

        // Reset votes for that target
        delete room.kickVotes[target];

        await saveRoomToDB(room, saveTimeouts, true);

        console.log(`🚫 ${target} has been banned from room ${roomId}`);
      }

      callback?.({ success: true });
    } catch (err) {
      console.error("voteKick error:", err);
      callback?.({ success: false, message: "Server error" });
    }
  });
};
