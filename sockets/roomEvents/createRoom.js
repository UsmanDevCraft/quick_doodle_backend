import { generate } from "random-words";
import { publicPlayers, saveRoomToDB } from "../helpers.js";

export const createRoomEvent = (socket, rooms, saveTimeouts) => {
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
};
