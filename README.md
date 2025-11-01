# 🎨 QuickDoodle — Backend

QuickDoodle is a real-time multiplayer drawing & guessing game inspired by Skribbl.io.  
Players take turns drawing a secret word while others guess it as fast as possible.  
The backend manages all multiplayer logic, real-time synchronization, scoring, and room lifecycle.

---

## 🚀 Features

- ✏️ Real-time drawing synchronization (WebSockets)
- 🌐 Multiplayer support — private rooms & global rooms
- 🏠 Room management (create / join / leave)
- 💬 Chat messaging between players
- 🎯 Scoring system based on guessing accuracy and speed
- 🧠 Word prompts & round progression logic
- ⏳ Graceful handling of disconnects (rejoin timer)
- 📂 *(Planned)* Persistent game history & leaderboard in DB

---

## 🛠️ Tech Stack

| Component   | Technology |
|-------------|------------|
| Backend     | Node.js + Express.js |
| Realtime    | Socket.IO |
| Database    | MongoDB (Mongoose) |
| Utilities   | `uuid`, `random-words` |

---

## ⚙️ Socket Logic Modularization

Socket logic is split into focused modules:

| File / Folder           | Responsibility |
|------------------------|----------------|
| `helpers.js`           | Utility helpers — room access, player visibility, DB save/load |
| `roomSocket.js`        | Sets up room-related events |
| `chatSocket.js`        | Handles chat message events |
| `gameEventsSocket.js`  | Controls guessing, drawing, round flow |
| `disconnectSocket.js`  | Handles player disconnects + grace timeout |
| `gameSocket.js`        | Main orchestrator (injects shared state + registers handlers) |
| `/gameEvents`          | Individual event logic (drawing, guessing, etc.) |
| `/roomEvents`          | Room logic (create/join/global-room, vote-kick, etc.) |

Each module is **SRP-driven (Single Responsibility Principle)**, accepts passed-in state, and avoids hidden global variables.

---

## ✅ Folder Structure

```bash
/quick_doodle_be
├── config                 # Database configuration
│   └── database.js
│
├── controllers            # (add REST APIs later)
│
├── models                 # MongoDB models (Mongoose)
│   └── Room.js
│
├── routes                 # (future REST routes)
│
├── sockets                # Socket.IO event handlers
│   ├── gameEvents         # Game-specific events
│   │   ├── drawing.js
│   │   ├── guessWord.js
│   │   └── showDrawBox.js
│   │
│   ├── roomEvents         # All room-related actions
│   │   ├── checkRoom.js
│   │   ├── createRoom.js
│   │   ├── joinGlobalRoom.js
│   │   ├── joinRoom.js
│   │   ├── leaveRoom.js
│   │   ├── requestRoomInfo.js
│   │   └── voteKick.js
│   │
│   ├── chatSocket.js          # Chat handling
│   ├── disconnectSocket.js    # Player disconnect logic
│   ├── gameEventsSocket.js    # Hooks gameEvents into socket
│   ├── gameSocket.js          # Main orchestrator
│   ├── helpers.js             # Utility helpers (room, db ops)
│   └── roomSocket.js          # Hooks roomEvents into socket
│
├── index.js                    # App entry point (Express + Socket.IO)
├── package.json
└── README.md
```

---

## 🌍 Frontend Repository

> The frontend (Next.js + React + Socket.IO client) handles UI rendering, real-time updates, and user interactions.

🔗 *[Frontend repo link](https://github.com/UsmanDevCraft/Quick_Doodle)*

---

## 🚀 Running the Backend

```bash
npm install
npm run dev
````

Default Socket.IO server runs at:

```
http://localhost:3000
```

---

### ✅ Ready to Connect

Frontend connects via:

```ts
const socket = io("http://localhost:3000");
```

---

🛠️ Planned for future releases

> Authentication system — users can sign in and have personalized experience
> Game history per user — track room history, wins, streaks, and stats
> AI bot opponent — play even when no players are available

---

### ⭐ If you like this project, consider giving the repo a star 🥹!
