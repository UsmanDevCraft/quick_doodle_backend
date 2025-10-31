import { publicPlayers, saveRoomToDB } from "../helpers.js";

export const voteKickEvent = (io, socket, rooms, saveTimeouts) => {
  socket.on("voteKick", async ({ roomId, target, voter }, callback) => {
    try {
      const room = rooms[roomId];
      if (!room)
        return callback?.({ success: false, message: "Room not found" });

      // Cannot kick yourself
      if (target === voter)
        return callback?.({
          success: false,
          message: "You can't vote yourself",
        });

      // Player must exist
      const targetPlayer = room.players.find((p) => p.username === target);
      if (!targetPlayer)
        return callback?.({
          success: false,
          message: "Target player not found",
        });

      // Must be at least 3 players to enable vote kick
      if (room.players.length < 3)
        return callback?.({
          success: false,
          message: "Not enough players to vote kick",
        });

      if (!room.kickVotes) room.kickVotes = {};
      if (!room.banned) room.banned = new Set();

      // Initialize if not present
      if (!room.kickVotes[target]) room.kickVotes[target] = new Set();

      // Add vote
      room.kickVotes[target].add(voter);

      const totalPlayers = room.players.length;
      const votes = room.kickVotes[target].size;
      const requiredVotes = Math.ceil(totalPlayers * (2 / 3));

      console.log(
        `🗳️ ${voter} voted to kick ${target} (${votes}/${requiredVotes})`
      );

      // Broadcast progress to room
      io.to(roomId).emit("voteKickUpdate", {
        target,
        votes,
        requiredVotes,
      });

      // If threshold reached, kick the player
      if (votes >= requiredVotes) {
        const targetIndex = room.players.findIndex(
          (p) => p.username === target
        );
        const [kicked] = room.players.splice(targetIndex, 1);

        // Ban them from rejoining
        room.banned.add(target);

        const msg = {
          id: Date.now().toString(),
          player: "System",
          text: `${target} was kicked out of the room by majority vote.`,
          isSystem: true,
          timestamp: new Date(),
        };
        room.chats.push(msg);

        io.to(roomId).emit("updatePlayers", publicPlayers(room));
        io.to(roomId).emit("message", msg);

        // Reset votes for that target
        delete room.kickVotes[target];

        await saveRoomToDB(room, saveTimeouts, true);

        console.log(`🚫 ${target} has been banned from room ${roomId}`);
      }

      callback?.({ success: true });
    } catch (err) {
      console.error("voteKick error:", err);
      callback?.({ success: false, message: "Server error" });
    }
  });
};
