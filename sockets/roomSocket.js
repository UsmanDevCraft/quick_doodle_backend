import { createRoomEvent } from "./roomEvents/createRoom.js";
import { joinRoomEvent } from "./roomEvents/joinRoom.js";
import { requestRoomInfoEvent } from "./roomEvents/requestRoomInfo.js";
import { checkRoomEvent } from "./roomEvents/checkRoom.js";
import { joinGlobalRoomEvent } from "./roomEvents/joinGlobalRoom.js";
import { leaveRoomEvent } from "./roomEvents/leaveRoom.js";
import { voteKickEvent } from "./roomEvents/voteKick.js";

export const setupRoomSocket = (io, socket, rooms, saveTimeouts) => {
  createRoomEvent(socket, rooms, saveTimeouts);
  joinRoomEvent(io, socket, rooms, saveTimeouts);
  requestRoomInfoEvent(io, socket, rooms, saveTimeouts);
  checkRoomEvent(socket, rooms);
  joinGlobalRoomEvent(io, socket, rooms, saveTimeouts);
  leaveRoomEvent(io, socket, rooms, saveTimeouts);
  voteKickEvent(io, socket, rooms, saveTimeouts);
};
