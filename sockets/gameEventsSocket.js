import { guessWordEvent } from "./gameEvents/guessWord.js";
import { drawingEvent } from "./gameEvents/drawing.js";

export const setupGameEventsSocket = (io, socket, rooms, saveTimeouts) => {
  guessWordEvent(io, socket, rooms, saveTimeouts);
  drawingEvent(io, socket, rooms, saveTimeouts);
};
