import type { CapacitorConfig } from '@capacitor/cli';

// Set to true for development (loads from live server)
// Set to false for production (loads bundled assets from www/)
const isDev = true;

// Your development server URL - change this to your machine's IP
const DEV_SERVER_URL = 'http://192.168.1.100:5173';

const baseConfig: CapacitorConfig = {
  appId: 'com.noxamusic.app',
  appName: 'Noxa Music',
  webDir: 'www',
  
  plugins: {
    StatusBar: {
      backgroundColor: '#0a0a0a',
      style: 'DARK'
    }
  },
  
  android: {
    allowMixedContent: true,
    backgroundColor: '#0a0a0a',
    webContentsDebuggingEnabled: isDev
  },
  
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic'
  }
};

// Add live server for development
if (isDev) {
  baseConfig.server = {
    url: DEV_SERVER_URL,
    cleartext: true
  };
}

export default baseConfig;
