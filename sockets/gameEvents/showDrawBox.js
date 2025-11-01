export const showDrawBox = (socket) => {
  socket.on("toggleModeChanged", ({ roomId, mode }) => {
    socket.to(roomId).emit("toggleModeChanged", { mode });
  });
};
