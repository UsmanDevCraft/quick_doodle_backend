import { publicPlayers, saveRoomToDB, loadRoomFromDB } from "../helpers.js";
import Room from "../../models/Room.js";

export const joinGlobalRoomEvent = (io, socket, rooms, saveTimeouts) => {
  socket.on("joinGlobalRoom", async ({ username }, callback) => {
    try {
      console.log(`[joinGlobalRoom] Request by ${username}`);

      const MAX_PLAYERS = 12;

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
