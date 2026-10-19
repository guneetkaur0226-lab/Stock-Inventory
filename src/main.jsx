import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { initTheme } from './lib/theme.js';
import './styles.css';

initTheme();

// Remember the "install app" prompt so the More screen can offer a button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__bip = e;
  window.dispatchEvent(new Event('bip'));
});

registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
