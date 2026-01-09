# NOXA Music App - Complete Specification for UI Rebuild

> **Purpose**: This document contains everything needed to rebuild the frontend UI in Svelte while keeping the existing Node.js/Express backend intact.

---

## 1. APP OVERVIEW

**NOXA** is a self-hosted music streaming app with:
- Personal music library management
- Playlist creation and management
- Music import from Spotify, YouTube Music, and direct URLs
- Synced lyrics display (via LRCLIB)
- Offline support
- Admin panel for user management

**Backend**: Node.js + Express + SQLite  
**Current Frontend**: Vanilla JS + CSS (to be replaced with Svelte)

---

## 2. AUTHENTICATION

### Login Flow
```
POST /api/auth/login
Body: { username: string, password: string }
Response: { success: true, token: string, user: { id, username, email, is_admin } }
```

### Signup Flow
```
POST /api/auth/signup
Body: { username, password, email, referrerUrl?, utmSource?, utmMedium?, utmCampaign? }
Response: { success: true, token: string, user: object }
```

### Get Current User
```
GET /api/auth/me
Headers: { Authorization: "Bearer <token>" }
Response: { id, username, email, is_admin, created_at }
```

### Token Storage
- Store JWT in `localStorage` as `musicstream_token`
- Store user object in `localStorage` as `musicstream_user`
- Include token in all API requests: `Authorization: Bearer <token>`

---

## 3. PAGES & ROUTES

### 3.1 Home Page (`/`)
**Components needed:**
- Greeting header (time-based: "Good morning/afternoon/evening")
- Featured playlists carousel (horizontal scroll)
- "Recently Played" section
- "Your Playlists" section
- "Recommended" section

**API calls:**
```
GET /api/playlists - Get user's playlists
GET /api/playlists/generated - Get AI-generated playlists (Daily Mix, etc.)
```

### 3.2 Search Page
**Components needed:**
- Search input (debounced, 300ms)
- Results grid showing tracks, artists, albums
- Loading state
- Empty state

**API calls:**
```
GET /api/library/search?q={query}
Response: { 
  results: [{ id, title, artist, album, album_cover, duration, file_path }],
  total: number 
}
```

### 3.3 Library Page
**Sub-views (tabs):**
- Artists (grid of artist cards)
- Albums (grid of album cards)
- Playlists (grid of playlist cards)
- Downloads (list of downloaded tracks)

**API calls:**
```
GET /api/library/library - Get all tracks
GET /api/library/artists - Get unique artists
GET /api/library/albums - Get unique albums
GET /api/playlists - Get user playlists
```

### 3.4 Playlist Detail Page
**Components needed:**
- Playlist header (artwork, name, track count, total duration)
- Track list (reorderable via drag-drop)
- Play all button
- Shuffle button
- Add tracks button
- Delete playlist button

**API calls:**
```
GET /api/playlists/:playlistId - Get playlist info
GET /api/playlists/:playlistId/tracks - Get playlist tracks
POST /api/playlists/:playlistId/tracks - Add track { musicId }
DELETE /api/playlists/:playlistId/tracks/:musicId - Remove track
PUT /api/playlists/:playlistId/reorder - Reorder { trackIds: [] }
DELETE /api/playlists/:playlistId - Delete playlist
```

### 3.5 Artist Detail (Modal)
**API calls:**
```
GET /api/library/artist/:artistName
Response: { artist, tracks: [], albums: [] }
```

### 3.6 Album Detail (Modal)
**API calls:**
```
GET /api/library/album/:albumName
Response: { album, artist, tracks: [], album_cover }
```

---

## 4. CORE FEATURES

### 4.1 Music Player
**State to manage:**
```typescript
interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isShuffled: boolean;
}
```

**Audio streaming:**
```
GET /api/library/stream/:trackId
Returns: audio/mpeg stream
```

**Player controls:**
- Play/Pause
- Previous/Next
- Seek (progress bar)
- Volume control
- Shuffle toggle
- Repeat toggle (off → all → one)
- Queue view

### 4.2 Playlists
**Create playlist:**
```
POST /api/playlists
Body: { name: string, description?: string }
```

**Playlist artwork**: Uses first track's album cover, or custom uploaded image

### 4.3 Lyrics (LRCLIB Integration)
**Fetch lyrics:**
```
GET /api/lyrics?artist={artist}&track={title}&album={album}&duration={seconds}
Response: { 
  success: boolean,
  syncedLyrics: string | null,  // LRC format with timestamps
  plainLyrics: string | null,
  instrumental: boolean
}
```

**LRC format parsing:**
```
[00:21.25]Please could you stop the noise?
[00:25.35]I'm trying to get some rest
```

**Features:**
- Auto-scroll to current line
- Click line to seek
- Pre-fetch when song starts

### 4.4 Import Features

**Spotify Import:**
```
POST /api/spotify-playlist/import
Body: { playlistUrl: string }
```

**YouTube Music Import:**
```
POST /api/youtube-music-playlist/import
Body: { playlistUrl: string }
```

**URL Import (single song):**
```
POST /api/url-download/song
Body: { url: string }
```

### 4.5 Downloads Queue
```
GET /api/download/list - Get download queue
POST /api/download/add - Add to queue
GET /api/download/status/:id - Check status
DELETE /api/download/cancel/:id - Cancel download
```

---

## 5. DATA STRUCTURES

### Track
```typescript
interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  album_cover: string | null;  // URL path like "/music_lib/Artist/Album/cover.jpg"
  artist_image: string | null;
  duration: number;  // seconds
  file_path: string;
  genre: string | null;
  year: number | null;
  track_number: number | null;
}
```

### Playlist
```typescript
interface Playlist {
  id: number;
  name: string;
  description: string | null;
  artwork: string | null;
  user_id: number;
  is_generated: boolean;
  track_count: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
}
```

### User
```typescript
interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}
```

---

## 6. ARTWORK & IMAGES

### Paths
- Album covers: `/music_lib/{Artist}/{Album}/cover.jpg` or embedded
- Artist images: `/artwork_cache/artist_{Artist}.jpg`
- Playlist artwork: First track's cover or `/api/playlists/:id/artwork`
- Default artwork: `/images/default%20artwork_.jpg`

### Loading artwork
```javascript
function getArtworkUrl(path) {
  if (!path) return '/images/default%20artwork_.jpg';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE_URL}${path}`;
}
```

---

## 7. MOBILE VS DESKTOP

### Breakpoint
- Desktop: `> 768px`
- Mobile: `≤ 768px`

### Mobile-specific UI
- Bottom navigation bar (Home, Search, Library)
- Swipe-up now playing modal
- Mini player at bottom
- No sidebar

### Desktop-specific UI
- Left sidebar with navigation
- Full player bar at bottom
- Hover states on cards

---

## 8. SETTINGS DROPDOWN

**Contents:**
- User avatar and name
- Import options (Spotify, YouTube, URL)
- Community links (Discord, Support)
- Logout button

---

## 9. ADMIN PANEL (`/admin.html`)

Separate page for admins:
- User management
- System stats
- Analytics dashboard
- Music library management

**API prefix**: `/api/admin/*`

---

## 10. ANALYTICS TRACKING

**Session tracking:**
```
POST /api/analytics/session/start
POST /api/analytics/session/heartbeat
POST /api/analytics/session/end
```

**Listen tracking:**
```
POST /api/analytics/listen/start - { trackId }
POST /api/analytics/listen/end - { listenId, duration, completed, skipped }
```

**Search tracking:**
```
POST /api/analytics/search - { query, resultsCount }
```

---

## 11. REAL-TIME FEATURES

Currently none (no WebSockets). All data fetched via REST.

---

## 12. OFFLINE SUPPORT

Service worker caches:
- Static assets (JS, CSS, images)
- API responses (library, playlists)
- Downloaded tracks stored in IndexedDB

---

## 13. ENVIRONMENT

**API Base URL:**
- Development: `http://localhost:3001`
- Production: `https://stream.noxamusic.com`

**Config:**
```javascript
// In Svelte, use environment variables
const API_BASE = import.meta.env.VITE_API_URL || 'https://stream.noxamusic.com';

// API client wrapper
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('musicstream_token');
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Usage examples:
// api('/api/library/library')
// api('/api/playlists', { method: 'POST', body: JSON.stringify({ name: 'My Playlist' }) })
```

**Environment Variables (.env):**
```
VITE_API_URL=https://stream.noxamusic.com
```

**CORS Note:** 
The backend at stream.noxamusic.com must allow CORS from the frontend domain.

---

## 14. UI COMPONENTS CHECKLIST

### Layout
- [ ] App shell (sidebar + main content)
- [ ] Mobile bottom nav
- [ ] Top bar with search and user menu

### Cards
- [ ] Track card (artwork, title, artist, duration)
- [ ] Artist card (image, name)
- [ ] Album card (cover, name, artist)
- [ ] Playlist card (cover, name, track count)

### Player
- [ ] Full player bar (desktop)
- [ ] Mini player (mobile)
- [ ] Now playing modal (mobile)
- [ ] Queue drawer
- [ ] Progress bar (seekable)
- [ ] Volume slider

### Modals
- [ ] Artist detail modal
- [ ] Album detail modal
- [ ] Lyrics modal (fullscreen with blur)
- [ ] Import modals (Spotify, YouTube, URL)
- [ ] Create playlist modal
- [ ] Settings dropdown

### Lists
- [ ] Track list (for playlists, albums)
- [ ] Search results
- [ ] Download queue

### States
- [ ] Loading spinners
- [ ] Empty states
- [ ] Error states
- [ ] Skeleton loaders

---

## 15. KEYBOARD SHORTCUTS

- `Space` - Play/Pause
- `←` / `→` - Seek -10s / +10s
- `↑` / `↓` - Volume up/down
- `M` - Mute toggle
- `S` - Shuffle toggle
- `R` - Repeat toggle
- `Escape` - Close modals

---

## 16. DESIGN SYSTEM & VISUAL STYLE

### Overall Aesthetic: Glass Morphism + Dark Theme
The app uses a modern "glassmorphism" design with:
- Dark backgrounds with subtle transparency
- Backdrop blur effects
- Soft rounded corners everywhere
- Subtle borders with low opacity
- Gradient accents

### Glass Effect CSS Pattern
```css
.glass-card {
  background: rgba(26, 26, 26, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

.glass-elevated {
  background: rgba(40, 40, 40, 0.9);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Border Radius Standards
```css
--radius-sm: 8px;    /* Buttons, inputs */
--radius-md: 12px;   /* Cards, dropdowns */
--radius-lg: 16px;   /* Modals, panels */
--radius-xl: 24px;   /* Pills, nav items */
--radius-full: 50%;  /* Avatars, circular buttons */
```

---

## 17. MINI PLAYER (Mobile)

### Design
```
┌─────────────────────────────────────────────┐
│ ┌────┐  Track Title             advancement  │
│ │ 🎵 │  Artist Name                advancement │
│ └────┘                         [▶️] [❤️]   │
└─────────────────────────────────────────────┘
```

### Specifications
- **Position**: Fixed at bottom, above mobile nav
- **Height**: 64px
- **Background**: Glass effect with blur
- **Border radius**: 16px on top corners (or fully rounded if floating)
- **Artwork**: 48x48px, rounded 8px
- **Tap action**: Opens full-screen Now Playing modal

### CSS Example
```css
.mini-player {
  position: fixed;
  bottom: 70px; /* Above bottom nav */
  left: 8px;
  right: 8px;
  height: 64px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 12px;
  z-index: 100;
}

.mini-player-artwork {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.mini-player-info {
  flex: 1;
  min-width: 0;
}

.mini-player-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-player-artist {
  font-size: 12px;
  color: var(--text-secondary);
}
```

---

## 18. MOBILE BOTTOM NAVBAR

### Design
```
┌─────────────────────────────────────────────┐
│    🏠        🔍        📚        ⬇️         │
│   Home     Search   Library  Downloads      │
└─────────────────────────────────────────────┘
```

### Specifications
- **Position**: Fixed at bottom
- **Height**: 60px + safe area inset
- **Background**: Solid dark or glass
- **Border radius**: 20px on top corners (optional: floating style with full radius)
- **Icons**: 24px, with label below
- **Active state**: Accent color (green)

### CSS Example
```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(10, 10, 10, 0.98);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 99;
}

/* Floating style variant */
.bottom-nav.floating {
  bottom: 8px;
  left: 8px;
  right: 8px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-subdued);
  font-size: 11px;
  padding: 8px 16px;
  transition: color 0.2s;
}

.nav-item.active {
  color: var(--accent-green);
}

.nav-item i {
  font-size: 22px;
}
```

---

## 19. HOME PAGE BANNERS

### Featured Playlists Carousel (Daily Mix, etc.)

#### Design
```
┌──────────────────────────────────────────────────────┐
│  ← Horizontal Scroll →                               │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│ │             │ │             │ │             │     │
│ │  DAILY MIX  │ │  CHILL MIX  │ │ DISCOVER    │     │
│ │     1       │ │             │ │   WEEKLY    │     │
│ │             │ │             │ │             │     │
│ │ Based on... │ │ Relaxing... │ │ New music.. │     │
│ └─────────────┘ └─────────────┘ └─────────────┘     │
└──────────────────────────────────────────────────────┘
```

#### Specifications
- **Card size**: 320px width × 180px height (mobile), 400px × 220px (desktop)
- **Background**: Gradient based on dominant color of artwork
- **Border radius**: 16px
- **Content**: Label, title, subtitle
- **Horizontal scroll**: Snap to card, hide scrollbar

#### CSS Example
```css
.featured-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding: 8px 0 16px 0;
}

.featured-scroll::-webkit-scrollbar {
  display: none;
}

.featured-card {
  flex-shrink: 0;
  width: 320px;
  height: 180px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  scroll-snap-align: start;
  cursor: pointer;
  transition: transform 0.2s;
  position: relative;
  overflow: hidden;
}

.featured-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%);
}

.featured-card:hover {
  transform: scale(1.02);
}

.featured-label {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
  position: relative;
  z-index: 1;
}

.featured-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
  position: relative;
  z-index: 1;
}

.featured-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
}
```

### Gradient Backgrounds for Featured Cards
```css
/* Daily Mix gradients - generate based on playlist vibe */
.featured-card.daily-mix-1 {
  background: linear-gradient(135deg, #4a148c 0%, #1a237e 100%);
}

.featured-card.daily-mix-2 {
  background: linear-gradient(135deg, #1b5e20 0%, #004d40 100%);
}

.featured-card.chill {
  background: linear-gradient(135deg, #0d47a1 0%, #006064 100%);
}

.featured-card.discover {
  background: linear-gradient(135deg, #bf360c 0%, #e65100 100%);
}
```

### API for Generated Playlists
```
GET /api/playlists/generated
Response: {
  playlists: [
    {
      id: "daily-mix-1",
      name: "Daily Mix 1",
      description: "Based on your listening",
      gradient: ["#4a148c", "#1a237e"],
      tracks: [...],
      is_generated: true
    }
  ]
}
```

---

## 20. LYRICS IMPLEMENTATION (Complete Guide)

### Overview
Lyrics are fetched from LRCLIB API, which provides both synced (timestamped) and plain lyrics.

### API Endpoint
```
GET /api/lyrics?artist={artist}&track={title}&album={album}&duration={seconds}

Response (success):
{
  success: true,
  syncedLyrics: "[00:21.25]First line...\n[00:25.35]Second line...",
  plainLyrics: "First line...\nSecond line...",
  instrumental: false
}

Response (not found):
{
  success: false,
  error: "No lyrics found"
}

Response (instrumental):
{
  success: true,
  syncedLyrics: null,
  plainLyrics: null,
  instrumental: true
}
```

### LRC Format Parsing
```javascript
function parseLRC(lrcText) {
  if (!lrcText) return [];
  
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  
  while ((match = regex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, '0'), 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    
    if (text) {
      lines.push({ time, text });
    }
  }
  
  return lines.sort((a, b) => a.time - b.time);
}
```

### Svelte Lyrics Component
```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { playerStore } from '$lib/stores/player';
  
  export let track;
  
  let lyrics = [];
  let currentLineIndex = -1;
  let lyricsContainer;
  let syncInterval;
  
  // Fetch lyrics when track changes
  $: if (track) fetchLyrics(track);
  
  async function fetchLyrics(track) {
    const params = new URLSearchParams({
      artist: track.artist,
      track: track.title,
      album: track.album || '',
      duration: Math.round(track.duration || 0)
    });
    
    try {
      const res = await fetch(`/api/lyrics?${params}`);
      const data = await res.json();
      
      if (data.success && data.syncedLyrics) {
        lyrics = parseLRC(data.syncedLyrics);
        startSync();
      } else if (data.success && data.plainLyrics) {
        // Plain lyrics - no timestamps
        lyrics = data.plainLyrics.split('\n').map(text => ({ text, time: null }));
      } else if (data.instrumental) {
        lyrics = [{ text: '♪ Instrumental ♪', time: null }];
      } else {
        lyrics = [{ text: 'No lyrics found', time: null }];
      }
    } catch (err) {
      lyrics = [{ text: 'Failed to load lyrics', time: null }];
    }
  }
  
  function startSync() {
    stopSync();
    syncInterval = setInterval(updateCurrentLine, 100);
  }
  
  function stopSync() {
    if (syncInterval) clearInterval(syncInterval);
  }
  
  function updateCurrentLine() {
    const currentTime = $playerStore.currentTime;
    
    // Find the current line (last line that started before current time)
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time !== null && lyrics[i].time <= currentTime) {
        if (i !== currentLineIndex) {
          currentLineIndex = i;
          scrollToLine(i);
        }
        break;
      }
    }
  }
  
  function scrollToLine(index) {
    const line = lyricsContainer?.querySelector(`[data-index="${index}"]`);
    if (line) {
      line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  
  function seekToLine(index) {
    if (lyrics[index]?.time !== null) {
      playerStore.seek(lyrics[index].time);
    }
  }
  
  onDestroy(stopSync);
</script>

<div class="lyrics-modal" class:visible={$lyricsVisible}>
  <div class="lyrics-header">
    <img src={getArtworkUrl(track?.album_cover)} alt="" class="lyrics-artwork" />
    <div class="lyrics-track-info">
      <h2>{track?.title || 'No track'}</h2>
      <p>{track?.artist || ''}</p>
    </div>
    <button class="close-btn" on:click={() => lyricsVisible.set(false)}>
      <i class="fas fa-times"></i>
    </button>
  </div>
  
  <div class="lyrics-content" bind:this={lyricsContainer}>
    {#each lyrics as line, i}
      <div
        class="lyrics-line"
        class:active={i === currentLineIndex}
        class:synced={line.time !== null}
        data-index={i}
        on:click={() => seekToLine(i)}
      >
        {line.text}
      </div>
    {/each}
  </div>
</div>

<style>
  .lyrics-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(30px);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
  }
  
  .lyrics-modal.visible {
    opacity: 1;
    visibility: visible;
  }
  
  .lyrics-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .lyrics-artwork {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    object-fit: cover;
  }
  
  .lyrics-track-info {
    flex: 1;
  }
  
  .lyrics-track-info h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
  
  .lyrics-track-info p {
    font-size: 14px;
    color: var(--text-secondary);
    margin: 4px 0 0;
  }
  
  .close-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
  }
  
  .lyrics-content {
    flex: 1;
    overflow-y: auto;
    padding: 40px 20px;
    text-align: center;
  }
  
  .lyrics-line {
    font-size: 22px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.4);
    transition: all 0.3s ease;
    padding: 8px 0;
  }
  
  .lyrics-line.synced {
    cursor: pointer;
  }
  
  .lyrics-line.synced:hover {
    color: rgba(255, 255, 255, 0.6);
  }
  
  .lyrics-line.active {
    color: white;
    font-size: 26px;
    font-weight: 600;
  }
</style>
```

### Pre-fetching Lyrics
Fetch lyrics when a song starts playing, even if lyrics panel isn't open:

```javascript
// In player store or component
function onTrackChange(track) {
  // Pre-fetch in background
  lyricsCache.prefetch(track);
}

// Simple cache
const lyricsCache = {
  cache: new Map(),
  
  async prefetch(track) {
    const key = `${track.artist}-${track.title}`;
    if (this.cache.has(key)) return;
    
    const data = await fetchLyrics(track);
    this.cache.set(key, data);
    
    // Limit cache size
    if (this.cache.size > 20) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  },
  
  get(track) {
    return this.cache.get(`${track.artist}-${track.title}`);
  }
};
```

### Lyrics Button (in Player)
```svelte
<button 
  class="player-btn" 
  class:active={$lyricsVisible}
  on:click={() => lyricsVisible.update(v => !v)}
  title="Lyrics"
>
  <i class="fas fa-quote-right"></i>
</button>
```

---

## 21. COLOR SCHEME (CSS Variables)

```css
:root {
  /* Backgrounds */
  --bg-base: #0a0a0a;
  --bg-elevated: #1a1a1a;
  --bg-highlight: #2a2a2a;
  --bg-press: #333333;
  
  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #b3b3b3;
  --text-subdued: #6a6a6a;
  
  /* Accents */
  --accent-green: #1db954;
  --accent-green-hover: #1ed760;
  --accent-red: #ff3b30;
  --accent-blue: #0a84ff;
  
  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-medium: rgba(255, 255, 255, 0.15);
  
  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  
  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  
  /* Spacing */
  --player-height: 90px;
  --sidebar-width: 280px;
  --topbar-height: 64px;
  --mobile-nav-height: 60px;
}
```

---

## 22. MIGRATION NOTES

### Keep from backend
- All `/api/*` routes unchanged
- Database schema unchanged
- File serving (music files, artwork)

### Replace completely
- All HTML in `public/index.html`
- All CSS in `public/css/`
- All JS in `public/js/`

### New Svelte structure suggestion
```
src/
├── lib/
│   ├── components/
│   │   ├── Player/
│   │   │   ├── MiniPlayer.svelte
│   │   │   ├── FullPlayer.svelte
│   │   │   ├── NowPlaying.svelte
│   │   │   ├── Queue.svelte
│   │   │   └── Controls.svelte
│   │   ├── Cards/
│   │   │   ├── TrackCard.svelte
│   │   │   ├── ArtistCard.svelte
│   │   │   ├── AlbumCard.svelte
│   │   │   ├── PlaylistCard.svelte
│   │   │   └── FeaturedCard.svelte
│   │   ├── Modals/
│   │   │   ├── Lyrics.svelte
│   │   │   ├── ArtistDetail.svelte
│   │   │   ├── AlbumDetail.svelte
│   │   │   └── ImportModal.svelte
│   │   ├── Layout/
│   │   │   ├── Sidebar.svelte
│   │   │   ├── TopBar.svelte
│   │   │   ├── BottomNav.svelte
│   │   │   └── SettingsDropdown.svelte
│   │   └── UI/
│   │       ├── Button.svelte
│   │       ├── Input.svelte
│   │       ├── Slider.svelte
│   │       └── Skeleton.svelte
│   ├── stores/
│   │   ├── player.js      // Current track, queue, playback state
│   │   ├── auth.js        // User, token
│   │   ├── library.js     // Tracks, artists, albums cache
│   │   ├── playlists.js   // User playlists
│   │   ├── lyrics.js      // Lyrics cache and state
│   │   └── ui.js          // Modals, dropdowns, mobile nav
│   ├── api/
│   │   ├── client.js      // Fetch wrapper with auth
│   │   ├── library.js     // Library API calls
│   │   ├── playlists.js   // Playlist API calls
│   │   ├── auth.js        // Auth API calls
│   │   └── lyrics.js      // Lyrics API calls
│   └── utils/
│       ├── formatTime.js  // Duration formatting
│       ├── artwork.js     // Artwork URL handling
│       └── lrcParser.js   // LRC lyrics parsing
├── routes/
│   ├── +layout.svelte     // App shell, player, nav
│   ├── +page.svelte       // Home page
│   ├── search/+page.svelte
│   ├── library/+page.svelte
│   ├── playlist/[id]/+page.svelte
│   └── login/+page.svelte
├── app.html
└── app.css                // Global styles, CSS variables
```

---

## 23. TESTING CHECKLIST

After rebuild, verify:

### Authentication
- [ ] Login with valid credentials
- [ ] Login shows error for invalid credentials
- [ ] Signup creates new account
- [ ] Logout clears session
- [ ] Protected routes redirect to login

### Music Playback
- [ ] Click track to play
- [ ] Play/Pause button works
- [ ] Previous/Next track navigation
- [ ] Seek via progress bar
- [ ] Volume control works
- [ ] Mute/unmute works
- [ ] Shuffle toggles correctly
- [ ] Repeat cycles: off → all → one → off

### Playlists
- [ ] Create new playlist
- [ ] Add track to playlist
- [ ] Remove track from playlist
- [ ] Reorder tracks (drag & drop)
- [ ] Delete playlist
- [ ] Play entire playlist
- [ ] Shuffle playlist

### Library
- [ ] View all artists
- [ ] View all albums
- [ ] View all tracks
- [ ] Artist detail modal opens
- [ ] Album detail modal opens
- [ ] Search filters results

### Lyrics
- [ ] Lyrics load for track with lyrics
- [ ] "No lyrics" shows for unknown tracks
- [ ] "Instrumental" shows correctly
- [ ] Synced lyrics auto-scroll
- [ ] Click line to seek
- [ ] Lyrics pre-fetch works

### Import
- [ ] Spotify playlist import
- [ ] YouTube Music import
- [ ] Single URL download
- [ ] Download progress shows
- [ ] Cancel download works

### Mobile
- [ ] Bottom nav switches pages
- [ ] Mini player shows current track
- [ ] Tap mini player opens full view
- [ ] Swipe gestures work
- [ ] Settings dropdown opens

### Desktop
- [ ] Sidebar navigation works
- [ ] User menu dropdown opens
- [ ] Keyboard shortcuts work
- [ ] Hover states visible

### Artwork
- [ ] Album covers load
- [ ] Artist images load
- [ ] Default artwork for missing
- [ ] Playlist artwork shows

---

## 24. KEYBOARD SHORTCUTS REFERENCE

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Seek backward 10s |
| `→` | Seek forward 10s |
| `↑` | Volume up 10% |
| `↓` | Volume down 10% |
| `M` | Mute / Unmute |
| `S` | Toggle shuffle |
| `R` | Cycle repeat mode |
| `L` | Toggle lyrics |
| `Q` | Toggle queue |
| `Escape` | Close any modal |
| `/` | Focus search |

---

**Document Version**: 1.1  
**Generated**: January 2026  
**For**: Svelte UI Rebuild  
**Total Sections**: 24

