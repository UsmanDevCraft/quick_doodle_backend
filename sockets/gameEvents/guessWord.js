import { generate } from "random-words";
import { getRoom, publicPlayers, saveRoomToDB } from "../helpers.js";

export const guessWordEvent = (io, socket, rooms, saveTimeouts) => {
  socket.on("guessWord", async ({ roomId, username, guess } = {}) => {
    const room = getRoom(rooms, roomId);
    if (!room) return;

    const currentRound = room.rounds[room.currentRound - 1];
    const isCorrect =
      guess.trim().toLowerCase() === room.currentWord.toLowerCase();

    currentRound.guesses.push({
      player: username,
      guess,
      correct: isCorrect,
      timestamp: new Date(),
    });

    if (isCorrect) {
      const player = room.players.find((p) => p.username === username);
      if (player) {
        player.score += 10;
        currentRound.winner = username;
        currentRound.endedAt = new Date();
      }

      io.to(roomId).emit("winner", { username, word: room.currentWord });
      room.chats.push({
        id: Date.now().toString(),
        player: "System",
        text: `${username} guessed the word "${room.currentWord}"!`,
        isSystem: true,
        timestamp: new Date(),
      });

      io.to(roomId).emit("message", {
        id: Date.now().toString(),
        player: "System",
        text: `${username} guessed the word "${room.currentWord}"!`,
        isSystem: true,
        timestamp: Date.now(),
      });

      setTimeout(async () => {
        room.currentRound++;
        const riddlerIndex = room.players.findIndex(
          (p) => p.username === room.rounds[room.currentRound - 2]?.riddler
        );
        const nextRiddler =
          room.players[(riddlerIndex + 1) % room.players.length];

        room.currentWord = generate({ minLength: 4, maxLength: 10 });
        room.rounds.push({
          roundNumber: room.currentRound,
          word: room.currentWord,
          riddler: nextRiddler.username,
          guesses: [],
          startedAt: new Date(),
        });

        room.chats.push({
          id: Date.now().toString(),
          player: "System",
          text: `Round ${room.currentRound} started — ${nextRiddler.username} is the riddler!`,
          isSystem: true,
          timestamp: new Date(),
        });

        io.to(roomId).emit("newRound", {
          wordLength: room.currentWord.length,
          round: room.currentRound,
          riddler: nextRiddler.username,
        });

        io.to(nextRiddler.socketId).emit("roomInfo", {
          roomId,
          role: "riddler",
          word: room.currentWord,
          players: publicPlayers(room),
          round: room.currentRound,
        });

        io.to(roomId).emit("updatePlayers", publicPlayers(room));
        await saveRoomToDB(room, saveTimeouts, true);
      }, 2500);
    } else {
      room.chats.push({
        id: Date.now().toString(),
        player: username,
        text: guess,
        isSystem: false,
        timestamp: new Date(),
      });

      io.to(roomId).emit("message", {
        id: Date.now().toString(),
        player: username,
        text: guess,
        isSystem: false,
        timestamp: Date.now(),
      });
    }

    await saveRoomToDB(room, saveTimeouts);
  });
};
