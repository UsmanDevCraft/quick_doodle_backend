import { loadRoomFromDB } from "../helpers.js";

export const checkRoomEvent = (socket, rooms) => {
  socket.on("checkRoom", async ({ roomId, username }, callback) => {
    try {
      let room = rooms[roomId];
      if (!room) {
        await loadRoomFromDB(rooms, roomId);
        room = rooms[roomId];
      }

      if (!room) {
        return callback?.({ exists: false, message: "Room not found" });
      }
      if (!room.isActive) {
        return callback?.({
          exists: false,
          message: "Room is no longer active",
        });
      }

      const userExists = room.players?.some(
        (p) => p.username.toLowerCase() === username.toLowerCase()
      );

      if (userExists) {
        return callback?.({
          exists: true,
          isUsernameExists: true,
          message: "Username already taken in this room",
        });
      }

      callback?.({ exists: true, message: "Room is available" });
    } catch (err) {
      console.error("checkRoom error:", err);
      callback?.({ exists: false, message: "Server error" });
    }
  });
};
