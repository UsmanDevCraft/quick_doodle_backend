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
  riddler: String, // who is drawing / giving word
  winner: String, // who guessed correctly
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

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  host: String,
  currentWord: String,
  currentRound: { type: Number, default: 1 },
  players: [PlayerSchema],
  rounds: [RoundSchema],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Room || mongoose.model("Room", RoomSchema);
