import { io } from "socket.io-client";

// connect to your backend
const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("✅ Connected with ID:", socket.id);

  // Test: create a room
  socket.emit("createRoom", "TesterUser", (response) => {
    console.log("Room created:", response);

    // Test: join the same room with another "fake" client
    const socket2 = io("http://localhost:3000");
    socket2.on("connect", () => {
      console.log("✅ Second client connected:", socket2.id);
      socket2.emit(
        "joinRoom",
        { roomId: response.roomId, username: "AnotherUser" },
        (res) => {
          console.log("Join response:", res);
        }
      );
    });
  });
});

// listen for updates
socket.on("updatePlayers", (players) => {
  console.log("Players in room:", players);
});
