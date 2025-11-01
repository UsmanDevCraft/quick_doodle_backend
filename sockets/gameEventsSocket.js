import { guessWordEvent } from "./gameEvents/guessWord.js";
import { drawingEvent } from "./gameEvents/drawing.js";
import { showDrawBox } from "./gameEvents/showDrawBox.js";

export const setupGameEventsSocket = (io, socket, rooms, saveTimeouts) => {
  guessWordEvent(io, socket, rooms, saveTimeouts);
  drawingEvent(socket);
  showDrawBox(socket);
};
