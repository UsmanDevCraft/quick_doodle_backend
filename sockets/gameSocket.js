import { setupRoomSocket } from "./roomSocket.js";
import { setupChatSocket } from "./chatSocket.js";
import { setupGameEventsSocket } from "./gameEventsSocket.js";
import { setupDisconnectSocket } from "./disconnectSocket.js";

let rooms = {};
const saveTimeouts = {};

export default function gameSocket(io) {
  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    setupRoomSocket(io, socket, rooms, saveTimeouts);
    setupChatSocket(io, socket, rooms, saveTimeouts);
    setupGameEventsSocket(io, socket, rooms, saveTimeouts);
    setupDisconnectSocket(io, socket, rooms, saveTimeouts);
  });
}
