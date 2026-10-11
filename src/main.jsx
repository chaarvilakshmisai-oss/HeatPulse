import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initializeBrowserSession } from './lib/auth.js';
import './styles.css';

initializeBrowserSession();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
