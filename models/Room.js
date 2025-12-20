import mongoose from "mongoose";

const PlayerSchema = new mongoose.Schema({
  username: String,
  socketId: String,
  score: { type: Number, default: 0 },
  isHost: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
});

const RoundSchema = new mongoose.Schema({
  roundNumber: Number,
  word: String,
  riddler: String,
  winner: String,
  guesses: [
    {
      player: String,
      guess: String,
      correct: Boolean,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
});

const ChatSchema = new mongoose.Schema({
  id: String,
  player: String,
  text: String,
  isSystem: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  host: String,
  mode: { type: String, enum: ["global", "private", "ai"], default: "private" },
  currentWord: String,
  currentRound: { type: Number, default: 1 },
  players: [PlayerSchema],
  rounds: [RoundSchema],
  chats: [ChatSchema],

  // 🆕 Kick system
  kickVotes: {
    type: Map,
    of: [String],
    default: {},
  },

  // 🆕 Ban list
  banned: {
    type: [String],
    default: [],
  },

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Room || mongoose.model("Room", RoomSchema);
