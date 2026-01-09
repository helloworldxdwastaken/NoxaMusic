import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './App.css';

// Detect if running in Capacitor/mobile app
// Check for Capacitor object, file:// protocol, or capacitor:// protocol
const isCapacitor = !!(window as any).Capacitor || 
  window.location.protocol === 'file:' || 
  window.location.protocol === 'capacitor:' ||
  window.location.hostname === 'localhost' && window.location.port === '';

console.log('🚀 App starting...', {
  isCapacitor,
  protocol: window.location.protocol,
  hostname: window.location.hostname,
  href: window.location.href
});

// Register Service Worker for offline support (only in browser with http/https)
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}

// Use HashRouter for Capacitor/mobile, BrowserRouter for web
const Router = isCapacitor ? HashRouter : BrowserRouter;

console.log('📍 Using router:', isCapacitor ? 'HashRouter' : 'BrowserRouter');

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Router>
        <App />
      </Router>
    </React.StrictMode>
  );
  console.log('✅ React app rendered');
} catch (error) {
  console.error('❌ React render error:', error);
  document.body.innerHTML = `<div style="color:white;padding:20px;">Error: ${error}</div>`;
}

