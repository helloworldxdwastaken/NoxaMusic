# NOXA Music - React Frontend

A modern React-based frontend for the NOXA self-hosted music streaming app.

## Features

- 🎵 Music streaming with queue management
- 📝 Synced lyrics display (via LRCLIB)
- 📋 Playlist creation and management
- 🔍 Library search
- 📥 Import from Spotify, YouTube Music, and URLs
- 📱 Responsive design (mobile + desktop)
- 🌙 Dark theme with glass morphism design

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Zustand** - State management
- **React Router** - Client-side routing

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=https://stream.noxamusic.com
```

For local development with the backend running locally:

```env
VITE_API_URL=http://localhost:3001
```

## Project Structure

```
src/
├── lib/
│   ├── api/           # API client and endpoints
│   │   ├── client.ts  # Base fetch wrapper with auth
│   │   ├── auth.ts    # Authentication endpoints
│   │   ├── library.ts # Music library endpoints
│   │   ├── playlists.ts # Playlist endpoints
│   │   ├── lyrics.ts  # Lyrics fetching
│   │   ├── import.ts  # Import from Spotify/YouTube
│   │   └── analytics.ts # Analytics tracking
│   ├── components/
│   │   ├── Cards/     # Track, Artist, Album, Playlist cards
│   │   ├── Layout/    # Sidebar, TopBar, BottomNav
│   │   ├── Modals/    # Lyrics, Artist/Album detail, Import
│   │   ├── Player/    # Full player, mini player, controls
│   │   └── UI/        # Button, Input, Slider, Skeleton
│   ├── stores/        # Zustand stores
│   │   ├── auth.ts    # User authentication state
│   │   ├── player.ts  # Playback state and queue
│   │   ├── library.ts # Music library cache
│   │   ├── playlists.ts # User playlists
│   │   ├── lyrics.ts  # Lyrics state
│   │   └── ui.ts      # UI state (modals, mobile)
│   └── utils/         # Utility functions
│       ├── formatTime.ts
│       ├── artwork.ts
│       └── lrcParser.ts
├── pages/             # Route pages
│   ├── Home.tsx
│   ├── Search.tsx
│   ├── Library.tsx
│   ├── Playlist.tsx
│   ├── Downloads.tsx
│   ├── Login.tsx
│   └── Signup.tsx
├── App.tsx            # Main app with routing
├── App.css            # Global styles
└── main.tsx           # Entry point
```

## API Configuration

The app connects to the backend API at `https://stream.noxamusic.com` by default.

Authentication uses JWT tokens stored in localStorage:
- `musicstream_token` - JWT access token
- `musicstream_user` - Cached user object

## Design System

The app uses a dark theme with glass morphism effects:

### Colors
- Background: `#0a0a0a` (base), `#1a1a1a` (elevated)
- Text: White primary, `#b3b3b3` secondary
- Accent: `#1db954` (green)

### Glass Effect
```css
background: rgba(26, 26, 26, 0.8);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Border Radius
- Small: 8px (buttons)
- Medium: 12px (cards)
- Large: 16px (modals)
- XL: 24px (pills)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` / `→` | Seek -10s / +10s |
| `↑` / `↓` | Volume up/down |
| `M` | Mute toggle |
| `S` | Shuffle toggle |
| `R` | Repeat cycle |
| `L` | Toggle lyrics |
| `Q` | Toggle queue |
| `Escape` | Close modals |

## License

MIT

