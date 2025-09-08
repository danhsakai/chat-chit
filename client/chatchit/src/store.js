// client/src/store.js
import { combineReducers, configureStore, createSlice } from "@reduxjs/toolkit";
import { createSocketMiddleware } from "./socketMiddleware";
import { socket } from "./socket";

const authSlice = createSlice({
  name: "auth",
  initialState: { user: null, token: null },
  reducers: {
    setAuth(state, action) {
      Object.assign(state, action.payload);
    },
    logout(state) {
      state.user = null;
      state.token = null;
    },
  },
});

const roomsSlice = createSlice({
  name: "rooms",
  initialState: { list: [], current: null, unread: {}, lastReadAt: {} },
  reducers: {
    setRooms(state, action) {
      state.list = action.payload;
    },
    setCurrentRoom(state, action) {
      state.current = action.payload;
    },
    setUserRoomsState(state, action) {
      const { unread = {}, lastReadAt = {} } = action.payload || {};
      state.unread = { ...state.unread, ...unread };
      state.lastReadAt = { ...state.lastReadAt, ...lastReadAt };
    },
    incrementUnread(state, action) {
      const roomId = action.payload;
      state.unread[roomId] = (state.unread[roomId] || 0) + 1;
    },
    resetUnread(state, action) {
      const roomId = action.payload;
      state.unread[roomId] = 0;
    },
    setLastReadAt(state, action) {
      const { roomId, ts } = action.payload;
      state.lastReadAt[roomId] = ts || new Date().toISOString();
    },
  },
});

const messagesSlice = createSlice({
  name: "messages",
  initialState: { byRoom: {} },
  reducers: {
    setHistory(state, action) {
      const { roomId, messages } = action.payload;
      state.byRoom[roomId] = messages;
    },
    addMessage(state, action) {
      const m = action.payload;
      const list = (state.byRoom[m.roomId] ||= []);
      if (m.clientId && list.some((x) => x.clientId === m.clientId)) {
        return; // dedupe by client-generated id
      }
      list.push(m);
    },
  },
});

export const { setAuth, logout } = authSlice.actions;
export const { setRooms, setCurrentRoom, setUserRoomsState, incrementUnread, resetUnread, setLastReadAt } = roomsSlice.actions;
export const { setHistory, addMessage } = messagesSlice.actions;

const rootReducer = combineReducers({
  auth: authSlice.reducer,
  rooms: roomsSlice.reducer,
  messages: messagesSlice.reducer,
});

export { rootReducer };

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefault) =>
    getDefault().concat(createSocketMiddleware(socket)),
});
