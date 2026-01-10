import type {
  DownloadItem,
  LibraryStats,
  Playlist,
  PlaylistTrackItem,
  RemoteSearchResponse,
  RemoteTrack,
  Song,
  User,
} from '../types/models';

const normalizeString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const normalizeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const coerceBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return undefined;
};

export const mapSong = (raw: any): Song => ({
  id: Number(raw?.id ?? 0),
  title: normalizeString(raw?.title) ?? normalizeString(raw?.name) ?? 'Unknown Title',
  artist: normalizeString(raw?.artist) ?? normalizeString(raw?.artist_name) ?? '',
  album:
    normalizeString(raw?.album) ??
    normalizeString(raw?.album_name) ??
    (typeof raw?.album === 'object' ? normalizeString(raw?.album?.title) : undefined) ??
    undefined,
  duration:
    normalizeNumber(raw?.duration) ??
    (normalizeNumber(raw?.duration_ms) ? Math.round(Number(raw.duration_ms) / 1000) : undefined),
  filePath: normalizeString(raw?.file_path) ?? normalizeString(raw?.filePath),
  albumCover:
    normalizeString(raw?.album_cover) ??
    normalizeString(raw?.albumCover) ??
    normalizeString(raw?.cover) ??
    normalizeString(raw?.picture),
  source: normalizeString(raw?.source),
  trackId: normalizeString(raw?.track_id) ?? normalizeString(raw?.trackId),
  addedAt: normalizeString(raw?.added_at) ?? normalizeString(raw?.addedAt),
  isLocal:
    typeof raw?.is_local === 'boolean'
      ? raw.is_local
      : typeof raw?.isLocal === 'boolean'
        ? raw.isLocal
        : undefined,
  playlistTrackId:
    typeof raw?.playlist_track_id === 'number'
      ? raw.playlist_track_id
      : typeof raw?.playlistTrackId === 'number'
        ? raw.playlistTrackId
        : undefined,
});

export const mapSongs = (payload: any[]): Song[] => payload.map(mapSong);

export const mapPlaylist = (raw: any): Playlist => ({
  id: Number(raw?.id ?? 0),
  name: normalizeString(raw?.name) ?? 'Untitled Playlist',
  description: normalizeString(raw?.description) ?? null,
  coverUrl:
    normalizeString(raw?.cover_url) ??
    normalizeString(raw?.coverUrl) ??
    normalizeString(raw?.coverURL) ??
    normalizeString(raw?.artwork) ??
    normalizeString(raw?.image) ??
    null,
  trackCount:
    typeof raw?.track_count === 'number'
      ? raw.track_count
      : typeof raw?.trackCount === 'number'
        ? raw.trackCount
        : 0,
  createdAt: normalizeString(raw?.created_at) ?? normalizeString(raw?.createdAt) ?? null,
  userId:
    typeof raw?.user_id === 'number'
      ? raw.user_id
      : typeof raw?.userId === 'number'
        ? raw.userId
        : null,
});

export const mapPlaylists = (payload: any[]): Playlist[] => payload.map(mapPlaylist);

export const mapPlaylistTrack = (raw: any): PlaylistTrackItem => ({
  playlistTrackId:
    typeof raw?.playlist_track_id === 'number'
      ? raw.playlist_track_id
      : typeof raw?.playlistTrackId === 'number'
        ? raw.playlistTrackId
        : undefined,
  position:
    typeof raw?.position === 'number'
      ? raw.position
      : typeof raw?.order === 'number'
        ? raw.order
        : undefined,
  song: mapSong(raw?.song ?? raw?.track ?? raw),
});

export const mapPlaylistTracks = (payload: any[]): PlaylistTrackItem[] =>
  payload.map(mapPlaylistTrack);

export const mapUser = (raw: any): User => ({
  id: Number(raw?.id ?? 0),
  username: normalizeString(raw?.username) ?? '',
  email: normalizeString(raw?.email) ?? null,
  isAdmin: coerceBoolean(raw?.is_admin ?? raw?.isAdmin) ?? null,
  lastLogin: normalizeString(raw?.last_login ?? raw?.lastLogin) ?? null,
});

export const mapAuthResponse = (raw: any) => ({
  success: raw?.success,
  token: typeof raw?.token === 'string' ? raw.token : '',
  user: mapUser(raw?.user ?? raw),
});

export const mapDownloadItem = (raw: any): DownloadItem => ({
  id: String(raw?.id ?? ''),
  title: normalizeString(raw?.title) ?? '',
  artist: normalizeString(raw?.artist) ?? '',
  album: normalizeString(raw?.album) ?? null,
  status: (normalizeString(raw?.status) ?? 'unknown') as DownloadItem['status'],
  progress:
    typeof raw?.progress === 'number'
      ? raw.progress
      : typeof raw?.progress === 'string'
        ? Number.parseInt(raw.progress, 10)
        : undefined,
  createdAt: normalizeString(raw?.created_at) ?? normalizeString(raw?.createdAt) ?? null,
  completedAt: normalizeString(raw?.completed_at) ?? normalizeString(raw?.completedAt) ?? null,
  playlistId:
    typeof raw?.playlist_id === 'number'
      ? raw.playlist_id
      : typeof raw?.playlistId === 'number'
        ? raw.playlistId
        : null,
  userId:
    typeof raw?.user_id === 'number'
      ? raw.user_id
      : typeof raw?.userId === 'number'
        ? raw.userId
        : null,
  filePath: normalizeString(raw?.file_path) ?? normalizeString(raw?.filePath) ?? null,
});

export const mapDownloads = (payload: any[]): DownloadItem[] => payload.map(mapDownloadItem);

export const mapLibraryStats = (raw: any): LibraryStats => ({
  totalSongs:
    typeof raw?.totalSongs === 'number'
      ? raw.totalSongs
      : typeof raw?.total_songs === 'number'
        ? raw.total_songs
        : 0,
  totalArtists:
    typeof raw?.totalArtists === 'number'
      ? raw.totalArtists
      : typeof raw?.total_artists === 'number'
        ? raw.total_artists
        : 0,
  totalAlbums:
    typeof raw?.totalAlbums === 'number'
      ? raw.totalAlbums
      : typeof raw?.total_albums === 'number'
        ? raw.total_albums
        : 0,
  totalStorage:
    normalizeString(raw?.totalStorage) ?? normalizeString(raw?.total_storage) ?? undefined,
  totalStorageBytes:
    typeof raw?.totalStorageBytes === 'number'
      ? raw.totalStorageBytes
      : typeof raw?.total_storage_bytes === 'number'
        ? raw.total_storage_bytes
        : undefined,
});

export const mapRemoteTrack = (raw: any): RemoteTrack => ({
  id: String(raw?.id ?? raw?.track_id ?? raw?.trackId ?? ''),
  title: normalizeString(raw?.title) ?? normalizeString(raw?.name) ?? 'Unknown Title',
  artistName:
    normalizeString(raw?.artist_name) ??
    normalizeString(raw?.artistName) ??
    normalizeString(raw?.artist) ??
    normalizeString(raw?.artists?.[0]?.name) ??
    '',
  albumTitle:
    normalizeString(raw?.album_title) ??
    normalizeString(raw?.albumTitle) ??
    normalizeString(raw?.album?.title) ??
    normalizeString(raw?.album?.name) ??
    normalizeString(raw?.album_name) ??
    null,
  duration:
    normalizeNumber(raw?.duration) ??
    (normalizeNumber(raw?.duration_ms) ? Math.round(Number(raw.duration_ms) / 1000) : undefined),
  image:
    normalizeString(raw?.image) ??
    normalizeString(raw?.picture) ??
    normalizeString(raw?.cover) ??
    normalizeString(raw?.album?.cover) ??
    undefined,
  preview: normalizeString(raw?.preview) ?? undefined,
  source: normalizeString(raw?.source) ?? undefined,
  type: normalizeString(raw?.type) ?? undefined,
});

export const mapRemoteSearchResponse = (raw: RemoteSearchResponse): RemoteTrack[] => {
  const { data, items, results, tracks } = raw;
  const list = data ?? items ?? results ?? tracks ?? [];
  return list.map(mapRemoteTrack);
};
