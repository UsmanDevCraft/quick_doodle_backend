export const drawingEvent = (socket) => {
  socket.on("drawing", (stroke) => {
    const { roomId, ...rest } = stroke;
    socket.to(roomId).emit("drawing", rest);
  });
};
