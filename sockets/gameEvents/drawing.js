export const drawingEvent = (io, socket, rooms, saveTimeouts) => {
  socket.on("drawing", ({ roomId, data } = {}) => {
    socket.to(roomId).emit("drawing", data);
  });
};
