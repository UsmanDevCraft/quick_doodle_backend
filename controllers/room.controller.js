import { createRoomCore } from "../sockets/roomEvents/services/createRoom.service.js";
import { getRoomInfoCore } from "../sockets/roomEvents/services/getRoomInfo.service.js";
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

export const getRoomInfo = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.query;

    const data = await getRoomInfoCore({
      rooms,
      roomId,
      username,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("GET room error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
