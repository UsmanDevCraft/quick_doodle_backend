import {
  getRoom,
  publicPlayers,
  saveRoomToDB,
  loadRoomFromDB,
} from "../helpers.js";

export const requestRoomInfoEvent = (io, socket, rooms, saveTimeouts) => {
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
};
