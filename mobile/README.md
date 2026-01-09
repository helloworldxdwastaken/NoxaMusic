# Noxa Music - Mobile App

This is the mobile wrapper for Noxa Music, using **Capacitor** to wrap the existing React web app as a native mobile application.

## Architecture

```
┌─────────────────────────────────────┐
│         Native Mobile App           │
│     (Android/iOS via Capacitor)     │
├─────────────────────────────────────┤
│           WebView                   │
│  ┌───────────────────────────────┐  │
│  │   React Web App (NoxaMusic)   │  │
│  │   - Same frontend code        │  │
│  │   - Loaded from server OR     │  │
│  │     bundled in www/ folder    │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│   Capacitor Native Plugins          │
│   - Status Bar                      │
│   - App lifecycle                   │
│   - Background audio (coming)       │
└─────────────────────────────────────┘
```

## Benefits

1. **Single Codebase**: Update the React web app, and the mobile app updates automatically
2. **Hot Reload in Dev**: Point to your dev server for instant updates
3. **Native Features**: Access device features through Capacitor plugins
4. **Same Look & Feel**: Identical UI/UX across web and mobile

## Development Setup

### Prerequisites

- Node.js 20+
- For Android: Android Studio, Java 17
- For iOS: Xcode (macOS only), CocoaPods

### Quick Start

1. **Install dependencies**:
   ```bash
   cd mobile
   npm install
   ```

2. **For development (live reload from server)**:
   
   Edit `capacitor.config.ts` and set your server URL:
   ```typescript
   server: {
     url: 'http://YOUR_IP:5173',  // Your dev server
     cleartext: true,
   }
   ```

   Then sync and run:
   ```bash
   npx cap sync
   npx cap run android  # or ios
   ```

3. **For production (bundled assets)**:
   
   Build and bundle the React app:
   ```bash
   npm run build:web  # Builds React and copies to www/
   npm run sync       # Syncs with native projects
   ```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build:web` | Build React frontend and copy to www/ |
| `npm run sync` | Sync web assets with native platforms |
| `npm run open:android` | Open Android project in Android Studio |
| `npm run open:ios` | Open iOS project in Xcode |
| `npm run run:android` | Build and run on Android device/emulator |
| `npm run run:ios` | Build and run on iOS simulator |
| `npm run update` | Full rebuild (web + sync) |

## GitHub Actions

Workflows are set up to automatically build:

- **build-android.yml**: Builds debug APK on push to main/develop
- **release-android.yml**: Builds release APK/AAB on version tags (v*)
- **release-ios.yml**: Builds unsigned IPA on version tags (v*)

## App Configuration

- **App ID**: `com.noxamusic.app`
- **Display Name**: Noxa Music
- **Version**: 1.0.0

## Adding Native Features

To add native functionality (e.g., native audio player, push notifications):

1. Install the Capacitor plugin:
   ```bash
   npm install @capacitor/plugin-name
   npx cap sync
   ```

2. Use it in your React code:
   ```typescript
   import { PluginName } from '@capacitor/plugin-name';
   ```

## Troubleshooting

### Android build fails
- Ensure Java 17 is installed: `java -version`
- Accept Android SDK licenses: `cd android && ./gradlew --version`

### iOS build fails  
- Run `cd ios/App && pod install`
- Open in Xcode and fix signing issues

### WebView shows blank screen
- Check that the server URL in `capacitor.config.ts` is correct
- Ensure the React dev server is running
- For production, make sure `www/` contains the built assets

