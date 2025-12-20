import { generate } from "random-words";
import { publicPlayers, saveRoomToDB } from "../../helpers.js";

export const createRoomCore = async ({
  socketId = null,
  rooms,
  saveTimeouts,
  roomId,
  username,
  mode = "private",
}) => {
  const word = generate({ minLength: 4, maxLength: 10 });
  const isAiRoom = mode === "ai";

  rooms[roomId] = {
    roomId,
    host: username,
    mode,
    currentWord: word,
    currentRound: 1,
    players: [
      {
        socketId,
        username,
        score: 0,
        isHost: true,
        joinedAt: new Date(),
        connected: Boolean(socketId),
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

  if (isAiRoom) {
    rooms[roomId].players.push({
      socketId: null,
      username: "Riddler AI 🤖",
      score: 0,
      isHost: false,
      isAi: true,
      joinedAt: new Date(),
      connected: true,
    });

    // rooms[roomId].rounds[0].riddler = "Riddler AI 🤖";
  }

  await saveRoomToDB(rooms[roomId], saveTimeouts, true);

  return {
    room: rooms[roomId],
    response: {
      roomId,
      role: "riddler",
      word,
      wordLength: word.length,
      players: publicPlayers(rooms[roomId]),
      round: rooms[roomId].currentRound,
      riddler: username,
    },
  };
};
