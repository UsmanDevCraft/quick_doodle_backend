import { createRoomCore } from "./services/createRoom.service.js";

export const createRoomEvent = (socket, rooms, saveTimeouts) => {
  socket.on("createRoom", async ({ roomId, username, mode }, callback) => {
    try {
      const { response } = await createRoomCore({
        socketId: socket.id,
        rooms,
        saveTimeouts,
        roomId,
        username,
        mode,
      });

      socket.join(roomId);
      socket.emit("roomInfo", response);

      callback?.({ success: true, roomId });
    } catch (err) {
      console.error("createRoom error:", err);
      callback?.({ success: false, message: "server error" });
    }
  });
};
