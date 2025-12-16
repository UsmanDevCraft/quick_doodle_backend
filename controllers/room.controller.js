import { createRoomCore } from "../sockets/roomEvents/services/createRoom.service.js";
import { rooms, saveTimeouts } from "../sockets/roomStore.js";

export const createRoom = async (req, res) => {
  try {
    const { roomId, username, mode } = req.body;

    const { response } = await createRoomCore({
      rooms,
      saveTimeouts,
      roomId,
      username,
      mode,
    });

    return res.status(201).json({
      success: true,
      data: response,
    });
  } catch (err) {
    console.error("API createRoom error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
