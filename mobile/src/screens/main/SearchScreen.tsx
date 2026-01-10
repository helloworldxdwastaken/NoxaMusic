import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlaylists, requestDownloadAdd, searchLibrary, searchOnlineTracks } from '../../api/service';
import type { AppStackParamList, AppTabsParamList } from '../../navigation/types';
import type { RemoteTrack, Song } from '../../types/models';
import { playSong } from '../../services/player/PlayerService';
import { playPreview, subscribeToPreview } from '../../services/player/PreviewManager';
import ArtworkImage from '../../components/ArtworkImage';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../context/LanguageContext';
import { useAccentColor } from '../../hooks/useAccentColor';

type SearchMode = 'local' | 'online';
type OnlineSearchType = 'track' | 'artist' | 'album';
type LocalSearchType = 'track' | 'artist' | 'album';

interface LocalArtist {
  id: string;
  name: string;
  trackCount: number;
  songs: Song[];
  artwork?: string | null;
}

interface LocalAlbum {
  id: string;
  title: string;
  artist: string | null;
  trackCount: number;
  songs: Song[];
  artwork?: string | null;
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabsParamList, 'Search'>,
  NativeStackScreenProps<AppStackParamList>
>;

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { primary, onPrimary } = useAccentColor();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('local');
  const [onlineType, setOnlineType] = useState<OnlineSearchType>('track');
  const [localType, setLocalType] = useState<LocalSearchType>('track');
  const [downloadOptionsTrack, setDownloadOptionsTrack] = useState<RemoteTrack | null>(null);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<RemoteTrack | null>(null);
  const { data: playlists = [] } = useQuery({ queryKey: ['playlists'], queryFn: fetchPlaylists });

  const { data: localData, isFetching: localFetching } = useQuery({
    queryKey: ['library', 'search', query, localType],
    queryFn: () => searchLibrary(query.trim(), localType),
    enabled: mode === 'local' && query.trim().length > 1,
  });

  const { data: onlineResults, isFetching: onlineFetching } = useQuery({
    queryKey: ['music', 'search', query, onlineType],
    queryFn: () => searchOnlineTracks(query.trim(), onlineType),
    enabled: mode === 'online' && query.trim().length > 1,
  });

  const localSongs = useMemo(() => localData?.songs || [], [localData]);
  const localArtists = useMemo<LocalArtist[]>(() => {
    // If backend returns artists, use them directly (mapping needed if structure differs)
    if (localData?.artists && localData.artists.length > 0) {
      return localData.artists.map((artist: any) => ({
        id: artist.artist,
        name: artist.artist,
        trackCount: artist.track_count || 0,
        songs: [], // Songs loaded on detail screen
        artwork: artist.artist_image,
      }));
    }
    return [];
  }, [localData]);

  const localAlbums = useMemo<LocalAlbum[]>(() => {
    // If backend returns albums, use them directly
    if (localData?.albums && localData.albums.length > 0) {
      return localData.albums.map((album: any) => ({
        id: `${album.title}-${album.artist}`,
        title: album.album,
        artist: album.artist,
        trackCount: album.track_count || 0,
        songs: [], // Songs loaded on detail screen
        artwork: album.album_cover,
      }));
    }
    return [];
  }, [localData]);

  const onlineList = mode === 'online' ? onlineResults : [];
  const isFetching = mode === 'local' ? localFetching : onlineFetching;

  type DownloadRequest = {
    track: RemoteTrack;
    playlistId?: number;
  };

  const downloadMutation = useMutation<void, Error, DownloadRequest>({
    mutationFn: ({ track, playlistId }) =>
      requestDownloadAdd(
        track.title,
        track.artistName,
        track.albumTitle ?? undefined,
        playlistId,
      ),
    onSuccess: () => {
      Alert.alert(t('common.ok'), t('search.downloadQueued'));
    },
    onError: error => {
      const message = error instanceof Error ? error.message : t('search.downloadFailed');
      Alert.alert(t('common.error'), message);
    },
  });

  const handlePlayLocalSong = useCallback(
    (song: Song) => {
      const queue = localSongs.filter(entry => entry.id !== song.id);
      playSong(song, queue).catch(error => console.error('Failed to play song', error));
    },
    [localSongs],
  );

  const renderLocalSong = useCallback(
    ({ item }: { item: Song }) => (
      <TouchableOpacity style={styles.resultRow} onPress={() => handlePlayLocalSong(item)}>
        <ArtworkImage uri={item.albumCover} size={56} fallbackLabel={item.title?.[0]?.toUpperCase()} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handlePlayLocalSong],
  );

  const handleOpenArtist = useCallback(
    (artist: LocalArtist) => {
      navigation.navigate('ArtistDetail', {
        artistName: artist.name,
        songs: artist.songs,
      });
    },
    [navigation],
  );

  const handleOpenAlbum = useCallback(
    (album: LocalAlbum) => {
      navigation.navigate('AlbumDetail', {
        artistName: album.artist,
        albumTitle: album.title,
        songs: album.songs,
      });
    },
    [navigation],
  );

  const renderLocalArtist = useCallback(
    ({ item }: { item: LocalArtist }) => (
      <TouchableOpacity style={styles.resultRow} onPress={() => handleOpenArtist(item)}>
        <ArtworkImage uri={item.artwork} size={56} fallbackLabel={item.name?.[0]?.toUpperCase()} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {item.trackCount} {t('search.types.track')}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleOpenArtist, t],
  );

  const renderLocalAlbum = useCallback(
    ({ item }: { item: LocalAlbum }) => (
      <TouchableOpacity style={styles.resultRow} onPress={() => handleOpenAlbum(item)}>
        <ArtworkImage uri={item.artwork} size={56} fallbackLabel={item.title?.[0]?.toUpperCase()} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {item.artist || t('library.unknownArtist')}
          </Text>
          <Text style={styles.resultMeta}>
            {item.trackCount} {t('search.types.track')}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleOpenAlbum, t],
  );

  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPreview(id => setPreviewingId(id));
    return unsubscribe;
  }, []);

  const handlePreview = useCallback(async (track: RemoteTrack) => {
    Keyboard.dismiss();
    try {
      await playPreview(track);
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('common.error'),
      );
    }
  }, [t]);

  const renderOnlineItem = useCallback(
    ({ item }: { item: RemoteTrack }) => {
      const isPreviewing = previewingId === item.id;
      return (
        <TouchableOpacity style={styles.resultRow} onPress={() => handlePreview(item)} activeOpacity={0.8}>
          <ArtworkImage uri={item.image} size={56} fallbackLabel={item.title?.[0]?.toUpperCase()} />
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {item.artistName}
            </Text>
            {item.albumTitle && <Text style={styles.resultAlbum}>{item.albumTitle}</Text>}
            {isPreviewing ? (
              <Text style={[styles.previewBadge, { backgroundColor: primary, color: onPrimary }]}>{t('common.previewing')}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: primary }]}
            onPress={event => {
              event.stopPropagation();
              Keyboard.dismiss();
              setDownloadOptionsTrack(item);
            }}
            disabled={
              downloadMutation.isPending && downloadMutation.variables?.track.id === item.id
            }
          >
            {downloadMutation.isPending && downloadMutation.variables?.track.id === item.id ? (
              <ActivityIndicator color={onPrimary} size="small" />
            ) : (
              <Icon name="download" size={16} color={onPrimary} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [downloadMutation, handlePreview, onPrimary, previewingId, primary, t],
  );

  const renderEmptyState = useCallback(
    (context: SearchMode) => {
      if (query.trim().length <= 1) {
        return (
          <View style={styles.centered}>
            <View style={styles.emptyIcon}>
              <Icon name="search" size={24} color="#8aa4ff" />
            </View>
            <Text style={styles.emptyTitle}>{t('search.searchForMusic')}</Text>
            <Text style={styles.emptyText}>
              {context === 'local' ? t('search.localDescription') : t('search.discover')}
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}>
            <Icon name="slash" size={24} color="#f87171" />
          </View>
          <Text style={styles.emptyTitle}>{t('search.noResults')}</Text>
          <Text style={styles.emptyText}>{t('search.noResultsDescription')}</Text>
        </View>
      );
    },
    [query, t],
  );

  const localFilterChips = (
    <View style={styles.typeFilters}>
      <TouchableOpacity
        style={[styles.typeChip, localType === 'track' && styles.typeChipActive]}
        onPress={() => setLocalType('track')}
      >
        <Text style={[styles.typeChipText, localType === 'track' && [styles.typeChipTextActive, { color: primary }]]}>
          {t('search.types.track')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeChip, localType === 'artist' && styles.typeChipActive]}
        onPress={() => setLocalType('artist')}
      >
        <Text style={[styles.typeChipText, localType === 'artist' && [styles.typeChipTextActive, { color: primary }]]}>
          {t('search.types.artist')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeChip, localType === 'album' && styles.typeChipActive]}
        onPress={() => setLocalType('album')}
      >
        <Text style={[styles.typeChipText, localType === 'album' && [styles.typeChipTextActive, { color: primary }]]}>
          {t('search.types.album')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <TextInput
        style={styles.searchInput}
        placeholder={
          mode === 'local' ? t('search.placeholderLocal') : t('search.placeholderOnline')
        }
        placeholderTextColor="#606072"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {/* Search Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'local' && [styles.modeBtnActive, { backgroundColor: primary }]]}
          onPress={() => setMode('local')}
        >
          <Text style={[styles.modeBtnText, mode === 'local' && styles.modeBtnTextActive]}>
            {t('search.modes.local')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'online' && [styles.modeBtnActive, { backgroundColor: primary }]]}
          onPress={() => setMode('online')}
        >
          <Text style={[styles.modeBtnText, mode === 'online' && styles.modeBtnTextActive]}>
            {t('search.modes.online')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Type Filters */}
      {mode === 'local' ? localFilterChips : null}
      {mode === 'online' && (
        <View style={styles.typeFilters}>
          <TouchableOpacity
            style={[styles.typeChip, onlineType === 'track' && styles.typeChipActive]}
            onPress={() => setOnlineType('track')}
          >
            <Text style={[styles.typeChipText, onlineType === 'track' && [styles.typeChipTextActive, { color: primary }]]}>
              {t('search.types.track')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeChip, onlineType === 'artist' && styles.typeChipActive]}
            onPress={() => setOnlineType('artist')}
          >
            <Text
              style={[styles.typeChipText, onlineType === 'artist' && [styles.typeChipTextActive, { color: primary }]]}
            >
              {t('search.types.artist')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeChip, onlineType === 'album' && styles.typeChipActive]}
            onPress={() => setOnlineType('album')}
          >
            <Text style={[styles.typeChipText, onlineType === 'album' && [styles.typeChipTextActive, { color: primary }]]}>
              {t('search.types.album')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isFetching ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#ffffff" />
          <Text style={styles.loadingText}>{t('search.loading')}</Text>
        </View>
      ) : mode === 'local' ? (
        <>
          {localType === 'track' && (
            <FlatList<Song>
              data={localSongs}
              keyExtractor={item => `${item.id}`}
              renderItem={renderLocalSong}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={localSongs.length === 0 && styles.emptyContainer}
              ListEmptyComponent={renderEmptyState('local')}
            />
          )}
          {localType === 'artist' && (
            <FlatList<LocalArtist>
              data={localArtists}
              keyExtractor={item => item.id}
              renderItem={renderLocalArtist}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={localArtists.length === 0 && styles.emptyContainer}
              ListEmptyComponent={renderEmptyState('local')}
            />
          )}
          {localType === 'album' && (
            <FlatList<LocalAlbum>
              data={localAlbums}
              keyExtractor={item => item.id}
              renderItem={renderLocalAlbum}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={localAlbums.length === 0 && styles.emptyContainer}
              ListEmptyComponent={renderEmptyState('local')}
            />
          )}
        </>
      ) : (
        <FlatList<RemoteTrack>
          data={(onlineList as RemoteTrack[]) ?? []}
          keyExtractor={item => `${item.id}`}
          renderItem={renderOnlineItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            (!onlineList || onlineList.length === 0) && styles.emptyContainer
          }
          ListEmptyComponent={renderEmptyState('online')}
        />
      )}
      {downloadOptionsTrack ? (
        <View style={styles.dialogOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setDownloadOptionsTrack(null)} />
          <View style={styles.dialogContainer}>
            <Text style={styles.sheetTitle}>{t('search.chooseAction')}</Text>
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                downloadMutation.mutate({ track: downloadOptionsTrack });
                setDownloadOptionsTrack(null);
              }}
            >
              <Icon name="download" size={18} color="#ffffff" />
              <View style={styles.sheetActionTextGroup}>
                <Text style={styles.sheetActionText}>{t('search.downloadOnly')}</Text>
                <Text style={styles.sheetActionSubtext}>{t('search.saveOffline')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                if (playlists.length === 0) {
                  Alert.alert(t('common.error'), t('search.noPlaylistsAction'));
                  setDownloadOptionsTrack(null);
                  return;
                }
                setDownloadOptionsTrack(null);
                setPlaylistPickerTrack(downloadOptionsTrack);
              }}
            >
              <Icon name="plus-circle" size={18} color={primary} />
              <View style={styles.sheetActionTextGroup}>
                <Text style={[styles.sheetActionText, styles.sheetActionAccent, { color: primary }]}>
                  {t('search.downloadAdd')}
                </Text>
                <Text style={styles.sheetActionSubtext}>{t('search.chooseStorage')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setDownloadOptionsTrack(null)}>
              <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      {playlistPickerTrack ? (
        <View style={styles.dialogOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setPlaylistPickerTrack(null)} />
          <View style={[styles.dialogContainer, styles.playlistDialog]}>
            <Text style={styles.sheetTitle}>{t('search.selectPlaylist')}</Text>
            {playlists.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('search.noPlaylistsAction')}</Text>
            ) : (
              <ScrollView
                style={styles.playlistScroll}
                contentContainerStyle={styles.playlistList}
                showsVerticalScrollIndicator
              >
                {playlists.map(playlist => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.sheetAction}
                    onPress={() => {
                      downloadMutation.mutate({
                        track: playlistPickerTrack,
                        playlistId: playlist.id,
                      });
                      setPlaylistPickerTrack(null);
                    }}
                  >
                    <Icon name="folder-plus" size={18} color="#ffffff" />
                    <Text style={styles.sheetActionText}>{playlist.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setPlaylistPickerTrack(null)}>
              <Text style={styles.dialogCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    gap: 12,
  },
  searchInput: {
    backgroundColor: '#121212',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#121212',
    alignItems: 'center',
  },
  modeBtnActive: {},
  modeBtnText: {
    color: '#9090a5',
    fontSize: 14,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  typeFilters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#121212',
  },
  typeChipActive: {
    backgroundColor: '#1a1a1a',
  },
  typeChipText: {
    color: '#9090a5',
    fontSize: 13,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1f1f2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 14,
    color: '#9090a5',
    textAlign: 'center',
  },
  loadingText: {
    color: '#e6e6f2',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
  },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultSubtitle: {
    color: '#9090a5',
    fontSize: 14,
  },
  resultAlbum: {
    color: '#7a7a8c',
    fontSize: 12,
  },
  resultMeta: {
    color: '#7a7a8c',
    fontSize: 12,
  },
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dialogContainer: {
    width: '88%',
    backgroundColor: '#0d0d14',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 16,
  },
  playlistDialog: {
    maxHeight: '70%',
  },
  playlistScroll: {
    maxHeight: 260,
  },
  playlistList: {
    gap: 8,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  sheetActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetActionTextGroup: {
    flex: 1,
    gap: 2,
  },
  sheetActionSubtext: {
    color: '#8a8aa1',
    fontSize: 12,
  },
  sheetActionAccent: {
    fontWeight: '600',
  },
  sheetEmpty: {
    color: '#8a8aa1',
    fontSize: 14,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#1c1c23',
  },
  previewBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '600',
  },
  dialogCancelBtn: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#272738',
  },
  dialogCancelText: {
    color: '#d6d6e4',
    fontWeight: '600',
  },
});

export default SearchScreen;
