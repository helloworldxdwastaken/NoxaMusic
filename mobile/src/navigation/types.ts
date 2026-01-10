import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Song } from '../types/models';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type PlaylistDetailParams = {
  playlistId: number;
  playlistName?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  trackCount?: number | null;
};

export type LibraryView = 'artists' | 'playlists' | 'downloads';

export type LibraryStackParamList = {
  LibraryMain:
    | {
        view?: LibraryView;
      }
    | undefined;
  PlaylistDetail: PlaylistDetailParams;
  ArtistDetail: {
    artistName: string;
    songs: Song[];
  };
  AlbumDetail: {
    artistName: string | null;
    albumTitle: string;
    songs: Song[];
  };
};

export type AppTabsParamList = {
  Home: undefined;
  Library: NavigatorScreenParams<LibraryStackParamList> | undefined;
  Create: undefined;
  Search: undefined;
};

export type AppStackParamList = {
  Tabs:
    | {
        screen?: keyof AppTabsParamList;
      }
    | undefined;
  Settings: undefined;
  NowPlaying: undefined;
  DownloadRequest: undefined;
  ArtistDetail: {
    artistName: string;
    songs: Song[];
  };
  AlbumDetail: {
    artistName: string | null;
    albumTitle: string;
    songs: Song[];
  };
};
