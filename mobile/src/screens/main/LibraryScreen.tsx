import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../../components/Icon';
import { useAccentColor } from '../../hooks/useAccentColor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchPlaylists, fetchSongs } from '../../api/service';
import { useOffline } from '../../context/OfflineContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import type { LibraryStackParamList, LibraryView } from '../../navigation/types';
import type { Playlist, Song } from '../../types/models';
import ArtworkImage from '../../components/ArtworkImage';
import DownloadsScreen from './DownloadsScreen';
import { useLanguage } from '../../context/LanguageContext';

interface Artist {
  id: string;
  name: string;
  trackCount: number;
  songs: Song[];
  artwork?: string | null;
}

type Props = NativeStackScreenProps<LibraryStackParamList, 'LibraryMain'>;

const LibraryScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { primary } = useAccentColor();
  const { state: offlineState } = useOffline();
  const connectivity = useConnectivity();
  const { t } = useLanguage();
  const initialView = route.params?.view ?? 'artists';
  const [activeView, setActiveView] = useState<LibraryView>(initialView);

  const {
    data: onlineSongs = [],
    isLoading: songsLoading,
    isRefetching: songsRefetching,
    refetch: refetchSongs,
    error: songsError,
  } = useQuery({
    queryKey: ['library', 'songs'],
    queryFn: () => fetchSongs({ limit: 500 }),
    enabled: !connectivity.isOffline,
  });

  const {
    data: onlinePlaylists = [],
    isLoading: playlistsLoading,
    isRefetching: playlistsRefetching,
    refetch: refetchPlaylists,
  } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
    enabled: !connectivity.isOffline,
  });

  const songs = connectivity.isOffline
    ? Object.values(offlineState.tracks).map(entry => entry.song)
    : onlineSongs;

  const playlists: Playlist[] = connectivity.isOffline
    ? Object.values(offlineState.playlists).map(entry => ({
        id: entry.playlist.id,
        name: entry.playlist.name,
        description: entry.playlist.description,
        trackCount: entry.songIds.length,
        coverUrl: entry.artworkUri,
        createdAt: entry.downloadedAt,
        userId: entry.playlist.userId,
      }))
    : onlinePlaylists;

  // Group songs by artist
  const artists = useMemo<Artist[]>(() => {
    const grouped = songs.reduce(
      (acc, song) => {
        const artistName = song.artist || t('library.unknownArtist');
        if (!acc[artistName]) {
          acc[artistName] = {
            id: artistName,
            name: artistName,
            trackCount: 0,
            songs: [],
            artwork: song.albumCover ?? null,
          };
        }
        acc[artistName].songs.push(song);
        acc[artistName].trackCount += 1;
        if (!acc[artistName].artwork && song.albumCover) {
          acc[artistName].artwork = song.albumCover;
        }
        return acc;
      },
      {} as Record<string, Artist>,
    );
    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs, t]);

  const isLoading = songsLoading || playlistsLoading;
  const isRefetching = songsRefetching || playlistsRefetching;

  const handleRefresh = () => {
    refetchSongs();
    refetchPlaylists();
  };

  const labelForView = useCallback(
    (view: LibraryView) => {
      switch (view) {
        case 'artists':
          return t('library.artists');
        case 'playlists':
          return t('library.playlists');
        case 'downloads':
        default:
          return t('library.downloads');
      }
    },
    [t],
  );

  const tabItems = useMemo(
    () => [
      { key: 'artists' as LibraryView, label: t('library.artists'), icon: 'mic' as const },
      { key: 'playlists' as LibraryView, label: t('library.playlists'), icon: 'music' as const },
      { key: 'downloads' as LibraryView, label: t('library.downloads'), icon: 'download' as const },
    ],
    [t],
  );

  useEffect(() => {
    if (route.params?.view && route.params.view !== activeView) {
      setActiveView(route.params.view);
    }
  }, [route.params?.view, activeView]);

  const renderArtist = useCallback(
    ({ item }: { item: Artist }) => (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() =>
          navigation.navigate('ArtistDetail', {
            artistName: item.name,
            songs: item.songs,
          })
        }
      >
        <ArtworkImage
          uri={item.artwork}
          size={140}
          fallbackLabel={item.name?.[0]?.toUpperCase() ?? 'A'}
          shape="circle"
        />
        <Text style={styles.gridTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.gridSubtitle}>
          {t('playlist.trackCount', { count: item.trackCount })}
        </Text>
      </TouchableOpacity>
    ),
    [navigation, t],
  );

  const renderPlaylist = useCallback(
    ({ item }: { item: Playlist }) => (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() =>
          navigation.navigate('PlaylistDetail', {
            playlistId: item.id,
            playlistName: item.name,
            description: item.description,
            coverUrl: item.coverUrl ?? undefined,
            trackCount: item.trackCount,
          })
        }
      >
        <ArtworkImage
          uri={item.coverUrl}
          size={140}
          fallbackLabel={item.name?.[0]?.toUpperCase()}
        />
        <Text style={styles.gridTitle} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.gridSubtitle}>
          {t('playlist.trackCount', { count: item.trackCount })}
        </Text>
      </TouchableOpacity>
    ),
    [navigation, t],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('tabs.Library'),
    });
  }, [navigation, t]);

  if (!connectivity.isOffline && isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#ffffff" />
        <Text style={styles.loadingText}>{t('library.loading')}</Text>
      </View>
    );
  }

  if (!connectivity.isOffline && songsError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {songsError instanceof Error ? songsError.message : t('library.error')}
        </Text>
      </View>
    );
  }

  const activeLabel = labelForView(activeView);
  const activeLabelLower = activeLabel.toLowerCase();

  const listData = activeView === 'artists' ? artists : playlists;
  const listRenderer = activeView === 'artists' ? renderArtist : renderPlaylist;

  return (
    <View style={styles.container}>
      {/* View Tabs */}
      <View style={styles.tabs}>
        {tabItems.map(item => {
          const isActive = activeView === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tab, isActive && [styles.tabActive, { backgroundColor: primary }]]}
              onPress={() => setActiveView(item.key)}
            >
              <View style={styles.tabLabel}>
                <Icon
                  name={item.icon}
                  size={14}
                  color={isActive ? '#ffffff' : '#9090a5'}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{item.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {activeView === 'downloads' ? (
        <View style={[styles.downloadsWrapper, { paddingBottom: insets.bottom + 32 }]}>
          <DownloadsScreen />
        </View>
      ) : (
        <FlatList
          data={listData as any[]}
          keyExtractor={item => `${item.id}`}
          renderItem={listRenderer as any}
          numColumns={2}
          key={activeView}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            listData.length === 0
              ? styles.emptyContainer
              : styles.listContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={!connectivity.isOffline && isRefetching}
              onRefresh={connectivity.isOffline ? undefined : handleRefresh}
              tintColor="#ffffff"
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIconCircle}>
                <Icon
                  name={activeView === 'artists' ? 'mic' : 'music'}
                  size={28}
                  color="#8aa4ff"
                />
              </View>
              <Text style={styles.emptyText}>
                {connectivity.isOffline
                  ? t('library.noOfflineData', { view: activeLabelLower })
                  : t('library.noData', { view: activeLabelLower })}
              </Text>
              <Text style={styles.emptySubtext}>
                {connectivity.isOffline
                  ? t('library.downloadsHint')
                  : t('library.libraryHint')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
    marginTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#121212',
    alignItems: 'center',
  },
  tabLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: {},
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9090a5',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#e6e6f2',
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1b1b26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: '#9090a5',
    textAlign: 'center',
  },
  downloadsWrapper: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    backgroundColor: '#000000',
  },
  gridRow: {
    gap: 16,
    paddingHorizontal: 0,
  },
  gridCard: {
    flex: 1,
    maxWidth: '48%',
    gap: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  gridSubtitle: {
    fontSize: 12,
    color: '#9090a5',
    textAlign: 'center',
  },
});

export default LibraryScreen;
