# 🎨 QuickDoodle

QuickDoodle is a real-time multiplayer drawing and guessing game inspired by Skribbl.io.  
Players take turns drawing a word while others try to guess it as quickly as possible!

---

## 🚀 Features
- ✏️ Real-time drawing using canvas
- 🌐 Multiplayer support with WebSockets
- 🏠 Create or join private game rooms
- 🎯 Points system based on speed & accuracy
- 📝 Word prompts for the drawing player
- 📊 Leaderboard to track scores
- 📂 (Planned) Save game history and past rounds

---

## 🛠️ Tech Stack
**Backend:** Node.js, Express.js, Socket.IO  
**Database:** MongoDB (for user data, game records, and leaderboards)  

---

## Socket Logic Modularization

The socket logic for the game is split into modular files for better organization and maintainability:

- **`helpers.js`**: Utility functions for room access (`getRoom`), player formatting (`publicPlayers`), and database operations (`saveRoomToDB`, `loadRoomFromDB`).
- **`roomSocket.js`**: Handles room creation, joining, and info requests (`createRoom`, `joinRoom`, `requestRoomInfo`).
- **`chatSocket.js`**: Manages chat message handling (`chatMessage`).
- **`gameEventsSocket.js`**: Controls game mechanics like guessing, round transitions, and drawing (`guessWord`, `drawing`).
- **`disconnectSocket.js`**: Manages player disconnections with a 30-second grace period (`disconnect`).
- **`gameSocket.js`**: Orchestrates all modules, managing shared `rooms` and `saveTimeouts` state and setting up socket handlers.

Each module has a single responsibility, uses explicit state passing, and preserves all functionality. Dependencies: `uuid`, `random-words`, and `Room` model.

---