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
  }, 620);
}

function waitForStablePaint() {
  const fontReady = document.fonts ? document.fonts.ready : Promise.resolve();

  const imageReady = new Promise((resolve) => {
    const img = new Image();

    img.onload = resolve;
    img.onerror = resolve;
    img.src = '/images/banner-1.png';
  });

  Promise.all([fontReady, imageReady]).then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(removeFirstPaint, 180);
      });
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

waitForStablePaint();
