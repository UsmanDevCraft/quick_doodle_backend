import { getRoom, saveRoomToDB } from "./helpers.js";

export const setupChatSocket = (io, socket, rooms, saveTimeouts) => {
  socket.on("chatMessage", async ({ roomId, username, text } = {}) => {
    const room = getRoom(rooms, roomId);
    if (!room) return;

    const msg = {
      id: Date.now().toString(),
      player: username,
      text,
      isSystem: false,
      timestamp: new Date(),
    };

    room.chats.push(msg);
    io.to(roomId).emit("message", msg);
    await saveRoomToDB(room, saveTimeouts);
  });
};
