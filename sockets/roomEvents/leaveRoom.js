import { publicPlayers, saveRoomToDB } from "../helpers.js";

export const leaveRoomEvent = (io, socket, rooms, saveTimeouts) => {
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
};
