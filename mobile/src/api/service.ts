import axios from 'axios';

import {
  apiClient,
  bootstrapApiClient,
  getAdminAuthHeader,
  getBaseUrl,
  getAuthToken,
  persistUser,
  setAdminAuth,
  setAuthToken,
  setBaseUrl,
  setUnauthorizedHandler,
} from './client';
import {
  mapAuthResponse,
  mapDownloads,
  mapLibraryStats,
  mapPlaylist,
  mapPlaylists,
  mapPlaylistTracks,
  mapRemoteAlbumDetail,
  mapRemoteArtistDetail,
  mapRemoteSearchResponse,
  mapRemoteTrack,
  mapSmartSearchResult,
  mapSongs,
} from './mappers';
import type {
  AdminCredentials,
  BasicResponse,
  DownloadItem,
  LibraryStats,
  Playlist,
  RemoteAlbum,
  RemoteAlbumDetail,
  RemoteArtist,
  RemoteArtistDetail,
  RemoteTrack,
  SmartSearchResult,
  Song,
  User,
} from '../types/models';

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

type BasicApiShape = Partial<BasicResponse> | null | undefined;

const resolveErrorMessage = (payload: BasicApiShape, fallback = DEFAULT_ERROR_MESSAGE) => {
  if (!payload) {
    return fallback;
  }
  return payload.error ?? payload.message ?? fallback;
};

const parseBasicResponse = (data: unknown): BasicResponse | null => {
  if (data && typeof data === 'object') {
    const candidate = data as Record<string, unknown>;
    if (typeof candidate.success === 'boolean' || candidate.message || candidate.error) {
      return {
        success: Boolean(candidate.success),
        message: typeof candidate.message === 'string' ? candidate.message : undefined,
        error: typeof candidate.error === 'string' ? candidate.error : undefined,
      };
    }
  }
  return null;
};

const handleAxiosError = (error: unknown, fallback?: string): never => {
  if (axios.isAxiosError(error)) {
    const basic = parseBasicResponse(error.response?.data);
    const message =
      error.response?.status === 401
        ? 'Session expired. Please sign in again.'
        : resolveErrorMessage(basic, fallback);
    throw new Error(message);
  }
  throw error instanceof Error ? error : new Error(fallback ?? DEFAULT_ERROR_MESSAGE);
};

export const initializeApi = bootstrapApiClient;

export const registerUnauthorizedHandler = setUnauthorizedHandler;

export const getSessionToken = getAuthToken;

export const getApiBaseUrl = getBaseUrl;

export const updateBaseUrl = (url: string) => setBaseUrl(url);

export const testConnection = async (): Promise<boolean> => {
  try {
    await apiClient.get('/api/library/library', {
      params: { limit: 1 },
    });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return true; // server reachable but requires auth
    }
    return false;
  }
};

export const fetchSongs = async (params: { limit?: number; offset?: number } = {}): Promise<Song[]> => {
  try {
    const response = await apiClient.get('/api/library/library', {
      params,
    });
    return mapSongs(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load songs.');
  }
};

export interface SearchResults {
  songs: Song[];
  artists: any[];
  albums: any[];
}

export const searchLibrary = async (
  query: string,
  type: 'all' | 'track' | 'artist' | 'album' = 'all',
): Promise<SearchResults> => {
  try {
    const response = await apiClient.get('/api/library/search', {
      params: { q: query, type, limit: 50 },
    });
    // The backend returns { songs: [], artists: [], albums: [] }
    // We need to map the songs array using mapSongs
    const data = response.data;
    return {
      songs: Array.isArray(data.songs) ? mapSongs(data.songs) : [],
      artists: Array.isArray(data.artists) ? data.artists : [],
      albums: Array.isArray(data.albums) ? data.albums : [],
    };
  } catch {
    // Return empty results instead of throwing, to match previous behavior gracefully
    return { songs: [], artists: [], albums: [] };
  }
};

export const fetchArtistTracks = async (artist: string): Promise<Song[]> => {
  try {
    const response = await apiClient.get(`/api/library/artist/${encodeURIComponent(artist)}`, {
      params: { limit: 1000 },
    });
    return mapSongs(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load artist tracks.');
  }
};

export const fetchAlbumTracks = async (album: string): Promise<Song[]> => {
  try {
    const response = await apiClient.get(`/api/library/album/${encodeURIComponent(album)}`, {
      params: { limit: 1000 },
    });
    return mapSongs(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load album tracks.');
  }
};

export type OnlineSearchType = 'track' | 'artist' | 'album';

export const searchOnlineTracks = async (
  query: string,
  type: OnlineSearchType = 'track',
): Promise<RemoteTrack[]> => {
  try {
    const response = await apiClient.get('/api/music/search', {
      params: { q: query, type, limit: 30 },
    });
    const data = response.data;
    if (Array.isArray(data)) {
      return data.map(mapRemoteTrack);
    }
    return mapRemoteSearchResponse(data);
  } catch (error) {
    return handleAxiosError(error, 'Unable to search online catalog.');
  }
};

// Smart search - returns tracks, artists, albums at once
export const smartSearchOnline = async (query: string): Promise<SmartSearchResult> => {
  try {
    const response = await apiClient.get('/api/music/smart-search', {
      params: { q: query, limit: 10 },
    });
    return mapSmartSearchResult(response.data);
  } catch (error) {
    return handleAxiosError(error, 'Unable to search online catalog.');
  }
};

// Get online artist detail with albums
export const fetchOnlineArtist = async (artistId: string): Promise<RemoteArtistDetail> => {
  try {
    const response = await apiClient.get(`/api/music/artist/${artistId}`);
    return mapRemoteArtistDetail(response.data);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load artist details.');
  }
};

// Get online album detail with tracks
export const fetchOnlineAlbum = async (albumId: string): Promise<RemoteAlbumDetail> => {
  try {
    const response = await apiClient.get(`/api/music/album/${albumId}`);
    return mapRemoteAlbumDetail(response.data);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load album details.');
  }
};

// Check if tracks/albums already exist in local library
export const checkExistsInLibrary = async (
  tracks: Array<{ id: string; title: string; artist: string }>,
  albums: Array<{ id: string; title: string; artist: string }>,
): Promise<{ tracks: Record<string, boolean>; albums: Record<string, boolean> }> => {
  try {
    const response = await apiClient.post('/api/library/check-exists', { tracks, albums });
    return response.data;
  } catch {
    return { tracks: {}, albums: {} };
  }
};

export const fetchPlaylists = async (): Promise<Playlist[]> => {
  try {
    const response = await apiClient.get('/api/playlists');
    const data = response.data;
    if (Array.isArray(data?.playlists)) {
      return mapPlaylists(data.playlists);
    }
    if (Array.isArray(data)) {
      return mapPlaylists(data);
    }
    return [];
  } catch (error) {
    return handleAxiosError(error, 'Unable to load playlists.');
  }
};

export const fetchGeneratedPlaylists = async (): Promise<Playlist[]> => {
  try {
    const response = await apiClient.get('/api/playlists/generated');
    const data = response.data;
    if (Array.isArray(data?.playlists)) {
      return mapPlaylists(data.playlists);
    }
    if (Array.isArray(data)) {
      return mapPlaylists(data);
    }
    return [];
  } catch (error) {
    return handleAxiosError(error, 'Unable to load generated playlists.');
  }
};

export const fetchPlaylistTracks = async (playlistId: number): Promise<Song[]> => {
  try {
    const response = await apiClient.get(`/api/playlists/${playlistId}/tracks`);
    const data = response.data;
    let trackItems: any[] = [];
    if (Array.isArray(data?.tracks)) {
      trackItems = data.tracks;
    } else if (Array.isArray(data)) {
      trackItems = data;
    }
    return mapPlaylistTracks(trackItems).map(item => ({
      ...item.song,
      playlistTrackId: item.song.playlistTrackId ?? item.playlistTrackId ?? undefined,
    }));
  } catch (error) {
    return handleAxiosError(error, 'Unable to load playlist tracks.');
  }
};

export const createPlaylist = async (
  name: string,
  description?: string,
): Promise<Playlist> => {
  try {
    const response = await apiClient.post('/api/playlists', {
      name,
      ...(description ? { description } : {}),
    });
    if (response.data?.success && response.data?.playlist) {
      return mapPlaylist(response.data.playlist);
    }
    if (response.data?.playlist) {
      return mapPlaylist(response.data.playlist);
    }
    if (response.data?.id) {
      return mapPlaylist(response.data);
    }
    throw new Error('Playlist created but response malformed.');
  } catch (error) {
    return handleAxiosError(error, 'Failed to create playlist.');
  }
};

export const updatePlaylist = async (
  playlistId: number,
  payload: { name: string; description?: string | null },
): Promise<void> => {
  try {
    await apiClient.put(`/api/playlists/${playlistId}`, {
      name: payload.name,
      description: payload.description ?? undefined,
    });
  } catch (error) {
    return handleAxiosError(error, 'Failed to update playlist.');
  }
};

export const addTrackToPlaylist = async (
  playlistId: number,
  musicId: number,
  position?: number,
): Promise<void> => {
  try {
    await apiClient.post(`/api/playlists/${playlistId}/tracks`, {
      musicId,
      ...(typeof position === 'number' ? { position } : {}),
    });
  } catch (error) {
    return handleAxiosError(error, 'Failed to add track to playlist.');
  }
};

export const removeTrackFromPlaylist = async (playlistId: number, musicId: number): Promise<void> => {
  try {
    await apiClient.delete(`/api/playlists/${playlistId}/tracks/${musicId}`);
  } catch (error) {
    return handleAxiosError(error, 'Failed to remove track from playlist.');
  }
};


export const deletePlaylist = async (playlistId: number): Promise<void> => {
  try {
    await apiClient.delete(`/api/playlists/${playlistId}`);
  } catch (error) {
    return handleAxiosError(error, 'Failed to delete playlist.');
  }
};

export const reorderPlaylist = async (
  playlistId: number,
  orders: Array<{ musicId: number; position: number }>,
): Promise<void> => {
  try {
    await apiClient.put(`/api/playlists/${playlistId}/reorder`, {
      trackOrders: orders,
    });
  } catch (error) {
    return handleAxiosError(error, 'Failed to reorder playlist.');
  }
};

export const fetchLibraryStats = async (): Promise<LibraryStats> => {
  try {
    const response = await apiClient.get('/api/library/stats');
    return mapLibraryStats(response.data);
  } catch (error) {
    return handleAxiosError(error, 'Unable to load library stats.');
  }
};

export const getStreamUrl = (songId: number | string) =>
  `${getBaseUrl()}/api/library/stream/${songId}`;

const rememberSession = async (token: string, user: User, rememberMe: boolean) => {
  await setAuthToken(token, rememberMe);
  if (rememberMe) {
    await persistUser(user);
  } else {
    await persistUser(null);
  }
};

export const login = async (
  username: string,
  password: string,
  rememberMe = true,
): Promise<User> => {
  try {
    const response = await apiClient.post('/api/auth/login', { username, password });
    const { token, user } = mapAuthResponse(response.data);
    await rememberSession(token, user, rememberMe);
    return user;
  } catch (error) {
    return handleAxiosError(error, 'Login failed.');
  }
};

export const signup = async (
  username: string,
  password: string,
  rememberMe = true,
): Promise<User> => {
  try {
    const response = await apiClient.post('/api/auth/signup', { username, password });
    const { token, user } = mapAuthResponse(response.data);
    await rememberSession(token, user, rememberMe);
    return user;
  } catch (error) {
    return handleAxiosError(error, 'Signup failed.');
  }
};

export const logout = async () => {
  await setAuthToken(null);
  await persistUser(null);
};

export const addAllToLibrary = async (): Promise<string> => {
  try {
    const response = await apiClient.post('/api/library/add-all-to-my-library');
    const basic = parseBasicResponse(response.data);
    return basic?.message ?? 'Added music to your library';
  } catch (error) {
    return handleAxiosError(error, 'Failed to add items to your library.');
  }
};

export const fetchDownloads = async (): Promise<DownloadItem[]> => {
  try {
    const response = await apiClient.get('/api/download/list');
    if (Array.isArray(response.data?.downloads)) {
      return mapDownloads(response.data.downloads);
    }
    if (Array.isArray(response.data)) {
      return mapDownloads(response.data);
    }
    return [];
  } catch (error) {
    return handleAxiosError(error, 'Unable to load downloads.');
  }
};

const performDownloadAction = async (
  endpoint: string,
  payload: Record<string, unknown>,
  fallback: string,
): Promise<void> => {
  try {
    await apiClient.post(endpoint, payload);
  } catch (error) {
    return handleAxiosError(error, fallback);
  }
};

export const requestDownloadAdd = async (
  title: string,
  artist: string,
  album?: string,
  playlistId?: number,
): Promise<void> =>
  performDownloadAction(
    '/api/download/add',
    {
      title,
      artist,
      ...(album ? { album } : {}),
      ...(typeof playlistId === 'number' ? { playlistId } : {}),
    },
    'Download request failed.',
  );

export const requestUrlDownload = async (
  url: string,
  playlistId?: number,
): Promise<void> =>
  performDownloadAction(
    '/api/url-download/song',
    { url, ...(typeof playlistId === 'number' ? { playlistId } : {}) },
    'URL download request failed.',
  );

export const requestSpotifyPlaylistImport = async (
  playlistUrl: string,
  playlistId?: number,
): Promise<void> =>
  performDownloadAction(
    '/api/spotify-playlist/import',
    { playlistUrl, ...(typeof playlistId === 'number' ? { playlistId } : {}) },
    'Spotify playlist import failed.',
  );

export const cancelDownload = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/download/cancel/${id}`);
  } catch (error) {
    return handleAxiosError(error, 'Failed to cancel download.');
  }
};

export const deleteDownload = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/download/delete/${id}`);
  } catch (error) {
    return handleAxiosError(error, 'Failed to delete download.');
  }
};

export const setAdminCredentials = async (creds: AdminCredentials | null, remember = true) => {
  await setAdminAuth(creds, remember);
};

const adminRequest = async <T>(
  endpoint: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: Record<string, unknown> } = {},
): Promise<T> => {
  try {
    const headers: Record<string, string> = {};
    const authHeader = getAdminAuthHeader();
    if (!authHeader) {
      throw new Error('Missing admin credentials');
    }
    headers.Authorization = authHeader;

    const response = await apiClient.request<T>({
      method: options.method ?? 'GET',
      url: `/api/admin${endpoint}`,
      data: options.body,
      headers,
    });
    return response.data;
  } catch (error) {
    return handleAxiosError(error, 'Admin request failed.');
  }
};

export const fetchAdminStats = async <T = any>(): Promise<T> => adminRequest<T>('/stats');

export const fetchAdminUserStatus = async <T = any>(): Promise<T> =>
  adminRequest<T>('/user-status');

export const checkAdminVersions = async <T = any>(): Promise<T> =>
  adminRequest<T>('/check-versions');

export const updateYtDlp = async (): Promise<string> => {
  const response = await adminRequest<BasicResponse>('/update-ytdlp', { method: 'POST' });
  return response?.message ?? 'Updating yt-dlp…';
};

export const updateSpotdl = async (): Promise<string> => {
  const response = await adminRequest<BasicResponse>('/update-spotdl', { method: 'POST' });
  return response?.message ?? 'Updating spotdl…';
};

