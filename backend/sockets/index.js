import { Server } from 'socket.io';

let io;

export const initSockets = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    console.log('Socket client connected:', socket.id);

    socket.on('subscribe-delivery', (deliveryId) => {
      socket.join(`delivery:${deliveryId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
};

export { io };
