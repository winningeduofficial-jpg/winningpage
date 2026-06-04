import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

function removePreHeader() {
  const preHeader = document.getElementById('pre-header');

  if (!preHeader) return;

  preHeader.remove();
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(removePreHeader);
});
