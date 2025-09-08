// client/src/socketMiddleware.js
import { addMessage, incrementUnread } from "./store";

export const createSocketMiddleware = (socket) => (store) => {
  // lắng nghe sự kiện từ server và dispatch
  socket.on("message:created", (msg) => {
    store.dispatch(addMessage(msg));
    const state = store.getState();
    const currentRoom = state.rooms.current;
    const me = state.auth.user?.id;
    // If message is for another room and not authored by me, count as unread
    if (msg.roomId !== currentRoom && msg.userId !== me) {
      store.dispatch(incrementUnread(msg.roomId));
    }
  });

  return (next) => (action) => next(action);
};
