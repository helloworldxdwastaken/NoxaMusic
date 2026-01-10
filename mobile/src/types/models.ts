export interface Song {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  duration?: number | null;
  filePath?: string | null;
  albumCover?: string | null;
  source?: string | null;
  trackId?: string | null;
  addedAt?: string | null;
  isLocal?: boolean | null;
  playlistTrackId?: number | null;
}

export interface Playlist {
  id: number;
  name: string;
  description?: string | null;
  coverUrl?: string | null;
  trackCount: number;
  createdAt?: string | null;
  userId?: number | null;
}

export interface PlaylistTrackItem {
  playlistTrackId?: number | null;
  position?: number | null;
  song: Song;
}

export interface User {
  id: number;
  username: string;
  email?: string | null;
  isAdmin?: boolean | null;
  lastLogin?: string | null;
}

export interface AdminCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success?: boolean;
  user: User;
  token: string;
}

export interface BasicResponse {
  success: boolean;
  message?: string | null;
  error?: string | null;
}

export interface LibraryStats {
  totalSongs: number;
  totalArtists: number;
  totalAlbums: number;
  totalStorage?: string | null;
  totalStorageBytes?: number | null;
}

export type DownloadStatus =
  | 'searching'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'canceled'
  | 'unknown';

export interface DownloadItem {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  status: DownloadStatus;
  progress?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
  playlistId?: number | null;
  userId?: number | null;
  filePath?: string | null;
}

export interface DownloadListResponse {
  success: boolean;
  downloads: DownloadItem[];
}

export interface OfflinePlaylist {
  id: number;
  name: string;
  description?: string | null;
  coverUrl?: string | null;
  trackCount: number;
  downloadedAt: string;
}

export interface OfflineTrack {
  id: number;
  song: Song;
  localFileUri: string;
  playlistIds: number[];
  artworkUri?: string | null;
  downloadedAt: string;
}

export interface OfflineCacheSnapshot {
  playlists: OfflinePlaylist[];
  tracks: OfflineTrack[];
}

export interface RemoteTrack {
  id: string;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  duration?: number | null;
  image?: string | null;
  preview?: string | null;
  source?: string | null;
  type?: string | null;
}

export interface RemoteSearchResponse {
  success?: boolean;
  data?: RemoteTrack[];
  items?: RemoteTrack[];
  results?: RemoteTrack[];
  tracks?: RemoteTrack[];
}

