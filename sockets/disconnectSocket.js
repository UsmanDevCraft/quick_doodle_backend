import { getRoom, publicPlayers, saveRoomToDB } from "./helpers.js";

export const setupDisconnectSocket = (io, socket, rooms, saveTimeouts) => {
  socket.on("disconnect", async () => {
    console.log("❌ Client disconnected:", socket.id);

    for (const [roomId, room] of Object.entries(rooms)) {
      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) continue;

      player.connected = false;
      console.log(`${player.username} disconnected from room ${roomId}`);

      // Allow 30s grace for reconnection before removing player
      setTimeout(async () => {
        // still disconnected?
        if (!player.connected) {
          const leftIndex = room.players.findIndex(
            (p) => p.socketId === socket.id
          );
          if (leftIndex === -1) return;

          const [left] = room.players.splice(leftIndex, 1);
          console.log(`${left.username} permanently left room ${roomId}`);

          let systemMessage = `${left.username} left the room.`;

          // 🧩 Handle host reassignment
          if (left.isHost) {
            if (room.players.length > 0) {
              // promote next available player
              room.players[0].isHost = true;
              room.host = room.players[0].username;
              systemMessage += ` ${room.host} is now the host.`;
              console.log(`👑 New host in ${roomId}: ${room.host}`);
            } else {
              // no players left
              room.isActive = false;
              systemMessage += ` The room is now inactive.`;
              console.log(
                `☠️ Room ${roomId} is now inactive (no players left).`
              );
            }
          }

          // 🕸 Handle riddler reassignment if host was also riddler
          const currentRound = room.rounds[room.currentRound - 1];
          if (currentRound && currentRound.riddler === left.username) {
            if (room.players.length > 0) {
              currentRound.riddler = room.players[0].username;
              room.currentWord = "newword"; // optionally regenerate or keep old
              systemMessage += ` ${currentRound.riddler} is now the riddler.`;
              console.log(`🎭 Riddler reassigned to ${currentRound.riddler}`);
            } else {
              console.log(`🎭 No riddler assigned, room empty.`);
            }
          }

          // 🧠 Update chats and emit system message
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
        }
      }, 30000);

      await saveRoomToDB(room, saveTimeouts, true);
      break;
    }
  });
};
