import { io } from '../sockets/index.js';

export const emitToAll = (event, payload) => {
  io.emit(event, payload);
};

export const emitToTruck = (truckId, event, payload) => {
  io.to(`truck:${truckId}`).emit(event, payload);
};

export const joinTruckRoom = (socket, truckId) => {
  socket.join(`truck:${truckId}`);
};