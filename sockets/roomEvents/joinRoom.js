import {
  getRoom,
  publicPlayers,
  saveRoomToDB,
  loadRoomFromDB,
} from "../helpers.js";

export const joinRoomEvent = (io, socket, rooms, saveTimeouts) => {
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
};
