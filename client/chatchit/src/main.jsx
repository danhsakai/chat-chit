// client/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store, rootReducer } from './store'
import App from './App'
import { socket } from './socket'
import { createSocketMiddleware } from './socketMiddleware'
import { configureStore } from '@reduxjs/toolkit'

const enhancedStore = configureStore({
  reducer: rootReducer, // use the actual root reducer
  middleware: (getDefault) => getDefault().concat(createSocketMiddleware(socket))
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <Provider store={enhancedStore}>
    <App />
  </Provider>
)