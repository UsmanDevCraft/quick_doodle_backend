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

    // 🤖 AI CHAT LOGIC
    if (room.mode !== "ai") return;

    // Prevent AI reacting to itself
    if (username === room.ai?.name) return;

    // 1️⃣ AI GREETING (ONCE)
    if (!room.ai.hasGreeted) {
      room.ai.hasGreeted = true;

      emitAiTyping(io, roomId);

      setTimeout(() => {
        const aiMsg = {
          id: Date.now().toString(),
          player: room.ai.name,
          text: "😈 Hehe… ready when you are. Take a guess.",
          isSystem: false,
          timestamp: new Date(),
        };

        room.chats.push(aiMsg);
        io.to(roomId).emit("message", aiMsg);
      }, 1200);

      return;
    }

    // 2️⃣ AI NORMAL CHAT REACTION
    if (room.mode === "ai" && room.ai) {
      emitAiTyping(io, roomId);

      setTimeout(async () => {
        const aiText = await generateAiTaunt(room.currentWord, guess);

        const aiMsg = {
          id: Date.now().toString(),
          player: room.ai.name,
          text: aiText,
          isSystem: false,
          timestamp: new Date(),
        };

        room.chats.push(aiMsg);
        io.to(roomId).emit("message", aiMsg);
      }, getAiDelay(room));
    }
  });
};

function emitAiTyping(io, roomId) {
  io.to(roomId).emit("aiTyping", true);
  setTimeout(() => {
    io.to(roomId).emit("aiTyping", false);
  }, 1200);
}
