# Noxa Music - React Native

Cross-platform music streaming app for iOS and Android with offline caching, built with React Native.

## Features

- 🎵 **Music Streaming** - Stream from `https://stream.noxamusic.com`
- 📥 **Offline Mode** - Download playlists and tracks for offline playback
- 🎨 **Modern UI** - Dark theme with smooth animations
- 🔐 **Authentication** - Secure login/signup with session management
- 📱 **Dynamic Island** - iOS Live Activities support for now playing
- 🎧 **Background Playback** - Continue listening when app is in background
- 🔍 **Search** - Browse library and search online catalog
- 📂 **Playlists** - Create, edit, and manage playlists
- ⬇️ **Downloads** - Track download progress and manage offline content

## Requirements

- Node.js >= 20.19.4
- iOS 15.0+
- Android API 21+ (Android 5.0)
- React Native 0.82+

## Installation

```bash
# Install dependencies
npm install

# Link vector icon fonts (required after installing dependencies)
npx react-native-asset

# iOS setup
cd ios
pod install
cd ..

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Backend

This app connects to the music streaming backend at:
- Production: `https://stream.noxamusic.com`
- Local dev: Configure in Settings screen

Backend source: `/home/tokyo/Desktop/music_app`

## Architecture

```
src/
├── api/           # API client and service layer
├── context/       # React Context providers (Auth, Offline)
├── hooks/         # Custom React hooks
├── navigation/    # React Navigation setup
├── screens/       # App screens
├── services/      # Offline manager, player service
└── types/         # TypeScript type definitions
```

## Key Technologies

- **React Native 0.82** - Cross-platform framework
- **TypeScript** - Type safety
- **React Navigation** - Navigation library
- **TanStack Query** - Data fetching and caching
- **Axios** - HTTP client
- **AsyncStorage** - Local storage
- **react-native-track-player** - Audio playback with system integration
- **react-native-fs** - File system operations for offline cache
- **NetInfo** - Network connectivity detection

## Building

### Android Release

```bash
cd android
./gradlew assembleRelease
# APK output: android/app/build/outputs/apk/release/app-release.apk
```

### iOS Release

```bash
cd ios
xcodebuild -workspace music_app.xcworkspace \
  -scheme music_app \
  -configuration Release \
  -sdk iphoneos \
  -archivePath build/music_app.xcarchive \
  archive
```

## GitHub Actions

CI/CD workflows included:
- **ci.yml** - Runs on every push (lint, typecheck, build)
- **release.yml** - Creates releases when pushing version tags

## License

MIT

## Author

Noxa Music Team

