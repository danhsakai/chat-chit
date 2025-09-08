// client/src/socketMiddleware.js
import { addMessage } from "./store";

export const createSocketMiddleware = (socket) => (store) => {
  // lắng nghe sự kiện từ server và dispatch
  socket.on("message:created", (msg) => {
    store.dispatch(addMessage(msg));
  });

  return (next) => (action) => next(action);
};
