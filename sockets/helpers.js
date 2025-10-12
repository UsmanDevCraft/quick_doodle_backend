import { generate } from "random-words";
import Room from "../models/Room.js";

export const getRoom = (rooms, roomId) => rooms[roomId];

export const publicPlayers = (room) =>
  room.players.map((p) => ({
    id: p.socketId,
    name: p.username,
    score: p.score,
    isHost: p.isHost,
  }));

export const saveRoomToDB = async (room, saveTimeouts, immediate = false) => {
  clearTimeout(saveTimeouts[room.roomId]);
  const dbRoom = {
    roomId: room.roomId,
    host: room.host,
    currentWord: room.currentWord,
    currentRound: room.currentRound,
    players: room.players.map((p) => ({
      username: p.username,
      score: p.score,
      isHost: p.isHost,
      joinedAt: p.joinedAt,
    })),
    rounds: room.rounds,
    chats: room.chats,
    isActive: room.isActive,
    createdAt: room.createdAt,
  };
  if (immediate) {
    try {
      await Room.findOneAndUpdate(
        { roomId: room.roomId },
        { $set: dbRoom },
        { upsert: true }
      );
      console.log(`💾 Room ${room.roomId} immediately saved to DB`);
    } catch (err) {
      console.error("DB Save Error:", err);
    }
    return;
  }

  saveTimeouts[room.roomId] = setTimeout(async () => {
    try {
      await Room.findOneAndUpdate(
        { roomId: room.roomId },
        { $set: dbRoom },
        { upsert: true }
      );
      console.log(`Room ${room.roomId} saved (debounced)`);
    } catch (err) {
      console.error("DB Save Error:", err);
    }
  }, 1000);
};

export const loadRoomFromDB = async (rooms, roomId) => {
  const data = await Room.findOne({ roomId });
  if (data) {
    const room = data.toObject();
    delete room._id;
    delete room.__v;
    rooms[roomId] = {
      roomId: room.roomId,
      host: room.host,
      currentWord:
        room.currentWord || generate({ minLength: 4, maxLength: 10 }),
      currentRound: room.currentRound || 1,
      players: room.players.map((p) => ({
        username: p.username,
        score: p.score || 0,
        isHost: p.isHost || false,
        joinedAt: p.joinedAt || new Date(),
        socketId: null,
        connected: false,
      })),
      rounds: room.rounds || [
        {
          roundNumber: 1,
          word: room.currentWord || generate({ minLength: 4, maxLength: 10 }),
          riddler: room.host,
          guesses: [],
          startedAt: new Date(),
        },
      ],
      chats: room.chats || [],
      isActive: room.isActive !== false,
      createdAt: room.createdAt || new Date(),
    };
    console.log(`Room ${roomId} restored from DB`);
  }
  return rooms[roomId];
};
