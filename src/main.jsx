import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

function removeFirstPaint() {
  const firstPaint = document.getElementById('first-paint');

  if (!firstPaint) {
    return;
  }

  firstPaint.classList.add('is-hide');

  window.setTimeout(() => {
    firstPaint.remove();
  }, 220);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

requestAnimationFrame(() => {
  requestAnimationFrame(removeFirstPaint);
});
