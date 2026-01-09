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

// Debug logs array for mobile debug panel
const debugLogs: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Override console.log to capture debug messages
console.log = (...args) => {
  originalConsoleLog(...args);
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  debugLogs.push(`[LOG] ${msg}`);
  if (debugLogs.length > 50) debugLogs.shift();
  updateDebugPanel();
};

console.error = (...args) => {
  originalConsoleError(...args);
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  debugLogs.push(`[ERR] ${msg}`);
  if (debugLogs.length > 50) debugLogs.shift();
  updateDebugPanel();
};

// Create debug panel for mobile
function updateDebugPanel() {
  if (!isCapacitor) return;
  let panel = document.getElementById('mobile-debug-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'mobile-debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 0;
      right: 0;
      max-height: 150px;
      overflow-y: auto;
      background: rgba(0,0,0,0.9);
      color: #0f0;
      font-size: 10px;
      font-family: monospace;
      padding: 5px;
      z-index: 99999;
      display: none;
    `;
    document.body.appendChild(panel);
    
    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'debug-toggle';
    btn.textContent = '🐛';
    btn.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 10px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #333;
      color: white;
      border: none;
      z-index: 100000;
      font-size: 20px;
    `;
    btn.onclick = () => {
      panel!.style.display = panel!.style.display === 'none' ? 'block' : 'none';
    };
    document.body.appendChild(btn);
  }
  panel.innerHTML = debugLogs.map(l => `<div>${l}</div>`).join('');
  panel.scrollTop = panel.scrollHeight;
}

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

