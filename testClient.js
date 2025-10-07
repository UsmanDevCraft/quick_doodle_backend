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

          if (res.success) {
            // 👉 Now test sending a guess
            socket2.emit("message", {
              roomId: response.roomId,
              username: "AnotherUser",
              text: "problem", // try to guess
            });
          }
        }
      );

      // 👉 Listen for winner event on socket2
      socket2.on("winner", ({ username, word }) => {
        console.log(`${username} guessed the word: ${word}`);
      });
    });
  });
});

// listen for updates (on the first client)
socket.on("updatePlayers", (players) => {
  console.log("Players in room:", players);
});
