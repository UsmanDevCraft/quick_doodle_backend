import { getRoom, publicPlayers, loadRoomFromDB } from "../../helpers.js";

export const getRoomInfoCore = async ({ rooms, roomId, username = null }) => {
  if (!rooms[roomId]) {
    await loadRoomFromDB(rooms, roomId);
  }

  const room = getRoom(rooms, roomId);
  if (!room) return null;

  const currentRound = room.currentRound;
  const currentRoundData = room.rounds[currentRound - 1];

  const isRiddler = username ? currentRoundData?.riddler === username : false;

  return {
    roomId,
    role: isRiddler ? "riddler" : "guesser",
    word: isRiddler ? room.currentWord : null,
    wordLength: room.currentWord ? room.currentWord.length : 0,
    players: publicPlayers(room),
    riddler: currentRoundData?.riddler,
    round: currentRound,
    chats: room.chats || [],
  };
};
