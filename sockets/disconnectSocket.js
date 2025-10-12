import { getRoom, publicPlayers, saveRoomToDB } from "./helpers.js";

export const setupDisconnectSocket = (io, socket, rooms, saveTimeouts) => {
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

              await saveRoomToDB(room, saveTimeouts, true);
            }
          }
        }, 30000);

        await saveRoomToDB(room, saveTimeouts, true);
        break;
      }
    }
  });
};
