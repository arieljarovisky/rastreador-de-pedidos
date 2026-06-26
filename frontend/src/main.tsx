import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ModalProvider } from './context/ModalContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import './index.css';

// Registrar Service Worker para soporte PWA Offline y Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        console.log('Service Worker registrado con éxito:', reg.scope);
        reg.update();
      })
      .catch((err) => {
        console.error('Error al registrar Service Worker:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ModalProvider>
        <App />
      </ModalProvider>
    </ThemeProvider>
  </StrictMode>,
);
