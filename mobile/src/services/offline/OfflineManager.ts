import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

import { getAuthToken } from '../../api/client';
import { getStreamUrl } from '../../api/service';
import type { Playlist, Song } from '../../types/models';

type OfflinePlaylistEntry = {
  playlist: Playlist;
  songIds: number[];
  downloadedAt: string;
  artworkUri?: string | null;
};

type OfflineTrackEntry = {
  song: Song;
  localFile: string;
  playlistIds: number[];
  artworkUri?: string | null;
  downloadedAt: string;
};

type OfflineCache = {
  playlists: OfflinePlaylistEntry[];
  tracks: OfflineTrackEntry[];
};

type OfflineSnapshot = {
  playlists: Record<number, OfflinePlaylistEntry>;
  tracks: Record<number, OfflineTrackEntry>;
  downloadProgress: Record<number, number>;
  activePlaylists: number[];
  songDownloads: number[];
  statusMessage?: string;
};

type Listener = (snapshot: OfflineSnapshot) => void;

const resolveBaseDirectory = () => {
  if (Platform.OS === 'android') {
    return RNFS.ExternalDirectoryPath ?? RNFS.DocumentDirectoryPath;
  }
  if (RNFS.LibraryDirectoryPath) {
    return RNFS.LibraryDirectoryPath;
  }
  return RNFS.DocumentDirectoryPath;
};

const BASE_DIR = resolveBaseDirectory();
const CACHE_DIR = `${BASE_DIR}/OfflineCache`;
const ARTWORK_DIR = `${CACHE_DIR}/Artwork`;
const METADATA_FILE = `${CACHE_DIR}/offline-metadata.json`;

const ensureDirectory = async (path: string) => {
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
};

const nowIso = () => new Date().toISOString();

const getSongArtwork = (song: Song) => song.albumCover ?? song.source ?? null;

export class OfflineManager {
  private playlists = new Map<number, OfflinePlaylistEntry>();
  private tracks = new Map<number, OfflineTrackEntry>();
  private downloadProgress = new Map<number, number>();
  private activePlaylists = new Set<number>();
  private songDownloads = new Set<number>();
  private listeners = new Set<Listener>();
  private statusMessage?: string;
  private metadataLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  async initialize() {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    this.loadingPromise = (async () => {
      await ensureDirectory(CACHE_DIR);
      await ensureDirectory(ARTWORK_DIR);
      await this.loadCache();
      this.metadataLoaded = true;
      this.notify();
    })();
    await this.loadingPromise;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): OfflineSnapshot {
    return {
      playlists: Object.fromEntries(this.playlists.entries()),
      tracks: Object.fromEntries(this.tracks.entries()),
      downloadProgress: Object.fromEntries(this.downloadProgress.entries()),
      activePlaylists: Array.from(this.activePlaylists),
      songDownloads: Array.from(this.songDownloads),
      statusMessage: this.statusMessage,
    };
  }

  async downloadPlaylist(playlist: Playlist, songs: Song[]) {
    if (!this.metadataLoaded) {
      await this.initialize();
    }
    if (!songs.length || this.activePlaylists.has(playlist.id)) {
      return;
    }
    this.activePlaylists.add(playlist.id);
    this.downloadProgress.set(playlist.id, 0);
    this.notify();

    try {
      let completed = 0;
      for (const song of songs) {
        const alreadyLocal = this.tracks.get(song.id);
        if (!alreadyLocal) {
          const filePath = await this.downloadSongFile(song);
          if (!filePath) {
            continue;
          }
          const artwork = await this.fetchArtwork(song);
          this.storeTrack(song, filePath, artwork, playlist.id, playlist);
        } else {
          this.attachTrackToPlaylist(song, playlist.id, playlist);
        }
        completed += 1;
        this.downloadProgress.set(playlist.id, Math.min(1, completed / songs.length));
        this.notify();
      }
      this.statusMessage = `Offline download ready: ${playlist.name}`;
    } finally {
      this.activePlaylists.delete(playlist.id);
      this.downloadProgress.delete(playlist.id);
      this.notify();
      await this.persistCache();
    }
  }

  async downloadSong(song: Song, playlistId?: number, playlist?: Playlist) {
    if (!this.metadataLoaded) {
      await this.initialize();
    }
    if (this.songDownloads.has(song.id)) {
      return;
    }
    if (this.tracks.has(song.id)) {
      if (playlistId) {
        this.attachTrackToPlaylist(song, playlistId, playlist);
      }
      return;
    }
    this.songDownloads.add(song.id);
    this.notify();
    try {
      const file = await this.downloadSongFile(song);
      if (!file) {
        return;
      }
      const artwork = await this.fetchArtwork(song);
      this.storeTrack(song, file, artwork, playlistId, playlist);
      this.statusMessage = `${song.title} saved for offline playback`;
      await this.persistCache();
      this.notify();
    } finally {
      this.songDownloads.delete(song.id);
      this.notify();
    }
  }

  async removePlaylist(playlistId: number) {
    const entry = this.playlists.get(playlistId);
    if (!entry) {
      return;
    }
    for (const songId of entry.songIds) {
      const track = this.tracks.get(songId);
      if (!track) {
        continue;
      }
      const updatedIds = track.playlistIds.filter(id => id !== playlistId);
      if (!updatedIds.length) {
        await this.removeTrack(songId);
      } else {
        this.tracks.set(songId, { ...track, playlistIds: updatedIds });
      }
    }
    this.playlists.delete(playlistId);
    await this.persistCache();
    this.notify();
  }

  async removeTrack(songId: number) {
    const track = this.tracks.get(songId);
    if (!track) {
      return;
    }
    this.tracks.delete(songId);
    await this.deleteFile(track.localFile);
    await this.deleteArtwork(track.artworkUri);
    for (const playlistId of track.playlistIds) {
      const playlist = this.playlists.get(playlistId);
      if (!playlist) {
        continue;
      }
      const updated = playlist.songIds.filter(id => id !== songId);
      if (!updated.length) {
        this.playlists.delete(playlistId);
      } else {
        this.playlists.set(playlistId, {
          ...playlist,
          songIds: updated,
          playlist: { ...playlist.playlist, trackCount: updated.length },
        });
      }
    }
    await this.persistCache();
    this.notify();
  }

  async removeSongFromPlaylist(song: Song, playlist: Playlist) {
    const track = this.tracks.get(song.id);
    const playlistEntry = this.playlists.get(playlist.id);
    if (!track || !playlistEntry) {
      return;
    }
    const updatedTrackIds = track.playlistIds.filter(id => id !== playlist.id);
    if (!updatedTrackIds.length) {
      await this.removeTrack(song.id);
    } else {
      this.tracks.set(song.id, { ...track, playlistIds: updatedTrackIds });
      const updatedSongs = playlistEntry.songIds.filter(id => id !== song.id);
      if (!updatedSongs.length) {
        this.playlists.delete(playlist.id);
      } else {
        this.playlists.set(playlist.id, { ...playlistEntry, songIds: updatedSongs });
      }
      await this.persistCache();
      this.notify();
    }
  }

  isPlaylistDownloaded(playlistId: number) {
    return this.playlists.has(playlistId);
  }

  playlistSongs(playlistId: number) {
    const entry = this.playlists.get(playlistId);
    if (!entry) {
      return [];
    }
    return entry.songIds
      .map(id => this.tracks.get(id))
      .filter(Boolean)
      .map(track => track!.song);
  }

  isSongDownloaded(songId: number) {
    return this.tracks.has(songId);
  }

  localUri(songId: number) {
    const track = this.tracks.get(songId);
    return track?.localFile ?? null;
  }

  artworkUri(songId: number) {
    const track = this.tracks.get(songId);
    return track?.artworkUri ?? null;
  }

  downloadedSongs() {
    return Array.from(this.tracks.values()).map(entry => entry.song);
  }

  downloadedPlaylists() {
    return Array.from(this.playlists.values());
  }

  private attachTrackToPlaylist(song: Song, playlistId?: number, playlist?: Playlist) {
    if (!playlistId) {
      return;
    }
    const track = this.tracks.get(song.id);
    if (!track) {
      return;
    }
    if (!track.playlistIds.includes(playlistId)) {
      track.playlistIds = [...track.playlistIds, playlistId];
      this.tracks.set(song.id, track);
    }
    const existingPlaylist = this.playlists.get(playlistId);
    if (existingPlaylist) {
      if (!existingPlaylist.songIds.includes(song.id)) {
        existingPlaylist.songIds.push(song.id);
      }
      if (!existingPlaylist.artworkUri) {
        existingPlaylist.artworkUri = track.artworkUri ?? getSongArtwork(song) ?? existingPlaylist.playlist.coverUrl ?? null;
      }
      existingPlaylist.playlist = {
        ...existingPlaylist.playlist,
        trackCount: existingPlaylist.songIds.length,
      };
      this.playlists.set(playlistId, existingPlaylist);
    } else {
      if (!playlist) {
        return;
      }
      const snapshot: OfflinePlaylistEntry = {
        playlist,
        songIds: [song.id],
        downloadedAt: nowIso(),
        artworkUri: track.artworkUri ?? getSongArtwork(song),
      };
      snapshot.playlist = {
        ...playlist,
        trackCount: snapshot.songIds.length,
      };
      this.playlists.set(playlistId, snapshot);
    }
  }

  private storeTrack(song: Song, localFile: string, artworkUri: string | null, playlistId?: number, playlist?: Playlist) {
    const existing = this.tracks.get(song.id);
    const playlistIds = new Set(existing?.playlistIds ?? []);
    if (playlistId) {
      playlistIds.add(playlistId);
    }
    const entry: OfflineTrackEntry = {
      song,
      localFile,
      playlistIds: Array.from(playlistIds),
      artworkUri: artworkUri ?? existing?.artworkUri ?? getSongArtwork(song),
      downloadedAt: existing?.downloadedAt ?? nowIso(),
    };
    this.tracks.set(song.id, entry);

    if (playlistId && playlist) {
      const existingPlaylist = this.playlists.get(playlistId);
      if (existingPlaylist) {
        if (!existingPlaylist.songIds.includes(song.id)) {
          existingPlaylist.songIds.push(song.id);
        }
        if (!existingPlaylist.artworkUri) {
          existingPlaylist.artworkUri = entry.artworkUri ?? getSongArtwork(song);
        }
        existingPlaylist.playlist = {
          ...existingPlaylist.playlist,
          trackCount: existingPlaylist.songIds.length,
        };
        this.playlists.set(playlistId, existingPlaylist);
      } else {
        const playlistSnapshot: OfflinePlaylistEntry = {
          playlist,
          songIds: [song.id],
          downloadedAt: nowIso(),
          artworkUri: entry.artworkUri ?? getSongArtwork(song),
        };
        playlistSnapshot.playlist = {
          ...playlist,
          trackCount: playlistSnapshot.songIds.length,
        };
        this.playlists.set(playlistId, playlistSnapshot);
      }
    }
    this.notify();
  }

  private async downloadSongFile(song: Song) {
    const streamUrl = getStreamUrl(song.id);
    if (!streamUrl) {
      return null;
    }
    await ensureDirectory(CACHE_DIR);
    const safeFileName = `song_${song.id}_${Date.now()}.mp3`;
    const destination = `${CACHE_DIR}/${safeFileName}`;
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    try {
      const { statusCode } = await RNFS.downloadFile({
        fromUrl: streamUrl,
        toFile: destination,
        headers,
        discretionary: true,
        cacheable: false,
      }).promise;
      if (statusCode && statusCode >= 400) {
        await RNFS.unlink(destination).catch(() => undefined);
        return null;
      }
      return `file://${destination}`;
    } catch (error) {
      await RNFS.unlink(destination).catch(() => undefined);
      console.warn('Offline download failed', error);
      this.statusMessage = `Failed to download ${song.title}`;
      return null;
    }
  }

  private async fetchArtwork(song: Song) {
    const artworkUrl = getSongArtwork(song);
    if (!artworkUrl) {
      return null;
    }
    const url = artworkUrl;
    const fileName = `art_${song.id}_${Date.now()}.jpg`;
    const destination = `${ARTWORK_DIR}/${fileName}`;
    try {
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      await RNFS.downloadFile({
        fromUrl: url,
        toFile: destination,
        discretionary: true,
        cacheable: true,
        headers,
      }).promise;
      return `file://${destination}`;
    } catch {
      return null;
    }
  }

  private async deleteFile(uri: string) {
    const path = uri.replace('file://', '');
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  }

  private async deleteArtwork(uri?: string | null) {
    if (!uri) {
      return;
    }
    await this.deleteFile(uri);
  }

  private notify() {
    const snapshot = this.snapshot();
    this.listeners.forEach(listener => listener(snapshot));
  }

  private async loadCache() {
    try {
      const exists = await RNFS.exists(METADATA_FILE);
      if (!exists) {
        return;
      }
      const raw = await RNFS.readFile(METADATA_FILE, 'utf8');
      const parsed: OfflineCache = JSON.parse(raw);
      this.playlists = new Map(parsed.playlists.map(entry => [entry.playlist.id, entry]));
      this.tracks = new Map(parsed.tracks.map(entry => [entry.song.id, entry]));
    } catch (error) {
      console.warn('Failed to load offline cache', error);
    }
  }

  private async persistCache() {
    const cache: OfflineCache = {
      playlists: Array.from(this.playlists.values()),
      tracks: Array.from(this.tracks.values()),
    };
    try {
      await RNFS.writeFile(METADATA_FILE, JSON.stringify(cache), 'utf8');
    } catch (error) {
      console.warn('Failed to persist offline cache', error);
    }
  }
}

export const offlineManager = new OfflineManager();
