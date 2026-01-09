import type { CapacitorConfig } from '@capacitor/cli';

// Production config - loads bundled assets from www/
// For local development, create capacitor.config.json with server.url pointing to your dev server
const config: CapacitorConfig = {
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
    backgroundColor: '#0a0a0a'
  },
  
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic'
  }
};

export default config;
