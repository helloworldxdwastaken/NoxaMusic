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

import { fetchPlaylists, requestDownloadAdd, searchLibrary, smartSearchOnline, fetchOnlineArtist, fetchOnlineAlbum, checkExistsInLibrary } from '../../api/service';
import type { AppStackParamList, AppTabsParamList } from '../../navigation/types';
import type { RemoteTrack, RemoteArtist, RemoteAlbum, RemoteAlbumDetail, Song } from '../../types/models';
import { playSong } from '../../services/player/PlayerService';
import { playPreview, subscribeToPreview } from '../../services/player/PreviewManager';
import ArtworkImage from '../../components/ArtworkImage';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../context/LanguageContext';
import { useAccentColor } from '../../hooks/useAccentColor';

type SearchMode = 'local' | 'online';
type OnlineSearchType = 'all' | 'track' | 'artist' | 'album';
type LocalSearchType = 'all' | 'track' | 'artist' | 'album';

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
  const [onlineType, setOnlineType] = useState<OnlineSearchType>('all');
  const [localType, setLocalType] = useState<LocalSearchType>('all');
  const [downloadOptionsTrack, setDownloadOptionsTrack] = useState<RemoteTrack | null>(null);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<RemoteTrack | null>(null);
  const [selectedOnlineAlbum, setSelectedOnlineAlbum] = useState<RemoteAlbumDetail | null>(null);
  const [existsInLibrary, setExistsInLibrary] = useState<Record<string, boolean>>({});
  const { data: playlists = [] } = useQuery({ queryKey: ['playlists'], queryFn: fetchPlaylists });

  const { data: localData, isFetching: localFetching } = useQuery({
    queryKey: ['library', 'search', query, localType],
    queryFn: () => searchLibrary(query.trim(), localType === 'all' ? 'all' : localType),
    enabled: mode === 'local' && query.trim().length > 1,
  });

  // Use smart search for online - returns tracks, artists, albums at once
  const { data: onlineData, isFetching: onlineFetching } = useQuery({
    queryKey: ['music', 'smart-search', query],
    queryFn: () => smartSearchOnline(query.trim()),
    enabled: mode === 'online' && query.trim().length > 1,
  });

  // Check existence in library when online results change
  useEffect(() => {
    if (onlineData && (onlineData.tracks.length > 0 || onlineData.albums.length > 0)) {
      const tracksToCheck = onlineData.tracks.map(t => ({ id: t.id, title: t.title, artist: t.artistName }));
      const albumsToCheck = onlineData.albums.map(a => ({ id: a.id, title: a.title, artist: a.artistName }));
      checkExistsInLibrary(tracksToCheck, albumsToCheck).then(result => {
        setExistsInLibrary({ ...result.tracks, ...result.albums });
      });
    }
  }, [onlineData]);

  const onlineTracks = useMemo(() => onlineData?.tracks || [], [onlineData]);
  const onlineArtists = useMemo(() => onlineData?.artists || [], [onlineData]);
  const onlineAlbums = useMemo(() => onlineData?.albums || [], [onlineData]);

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
      const inLibrary = existsInLibrary[item.id];
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
            {inLibrary ? (
              <Text style={styles.inLibraryBadge}>{t('search.inLibrary')}</Text>
            ) : null}
          </View>
          {!inLibrary && (
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
          )}
        </TouchableOpacity>
      );
    },
    [downloadMutation, existsInLibrary, handlePreview, onPrimary, previewingId, primary, t],
  );

  const handleOpenOnlineArtist = useCallback(async (artist: RemoteArtist) => {
    try {
      const artistDetail = await fetchOnlineArtist(artist.id);
      // Navigate to a modal or detail screen showing artist albums
      Alert.alert(artist.name, `${artistDetail.albums.length} albums available`);
    } catch (error) {
      Alert.alert(t('common.error'), t('search.loadFailed'));
    }
  }, [t]);

  const handleOpenOnlineAlbum = useCallback(async (album: RemoteAlbum) => {
    try {
      const albumDetail = await fetchOnlineAlbum(album.id);
      setSelectedOnlineAlbum(albumDetail);
    } catch (error) {
      Alert.alert(t('common.error'), t('search.loadFailed'));
    }
  }, [t]);

  const renderOnlineArtist = useCallback(
    ({ item }: { item: RemoteArtist }) => (
      <TouchableOpacity style={styles.resultRow} onPress={() => handleOpenOnlineArtist(item)}>
        <ArtworkImage uri={item.image} size={56} fallbackLabel={item.name?.[0]?.toUpperCase()} />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.fans && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {item.fans.toLocaleString()} fans
            </Text>
          )}
        </View>
        <Icon name="chevron-right" size={20} color="#6a6a6a" />
      </TouchableOpacity>
    ),
    [handleOpenOnlineArtist],
  );

  const renderOnlineAlbum = useCallback(
    ({ item }: { item: RemoteAlbum }) => {
      const inLibrary = existsInLibrary[item.id];
      return (
        <TouchableOpacity style={styles.resultRow} onPress={() => handleOpenOnlineAlbum(item)}>
          <ArtworkImage uri={item.image} size={56} fallbackLabel={item.title?.[0]?.toUpperCase()} />
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {item.artistName}
            </Text>
            {item.trackCount && (
              <Text style={styles.resultMeta}>
                {item.trackCount} {t('search.types.track')}
              </Text>
            )}
            {inLibrary ? (
              <Text style={styles.inLibraryBadge}>{t('search.inLibrary')}</Text>
            ) : null}
          </View>
          <Icon name="chevron-right" size={20} color="#6a6a6a" />
        </TouchableOpacity>
      );
    },
    [existsInLibrary, handleOpenOnlineAlbum, t],
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
        style={[styles.typeChip, localType === 'all' && styles.typeChipActive]}
        onPress={() => setLocalType('all')}
      >
        <Text style={[styles.typeChipText, localType === 'all' && [styles.typeChipTextActive, { color: primary }]]}>
          {t('search.types.all')}
        </Text>
      </TouchableOpacity>
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

  const onlineFilterChips = (
    <View style={styles.typeFilters}>
      <TouchableOpacity
        style={[styles.typeChip, onlineType === 'all' && styles.typeChipActive]}
        onPress={() => setOnlineType('all')}
      >
        <Text style={[styles.typeChipText, onlineType === 'all' && [styles.typeChipTextActive, { color: primary }]]}>
          {t('search.types.all')}
        </Text>
      </TouchableOpacity>
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
        <Text style={[styles.typeChipText, onlineType === 'artist' && [styles.typeChipTextActive, { color: primary }]]}>
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
      {mode === 'local' ? localFilterChips : onlineFilterChips}

      {isFetching ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#ffffff" />
          <Text style={styles.loadingText}>{t('search.loading')}</Text>
        </View>
      ) : mode === 'local' ? (
        <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
          {/* Songs section */}
          {(localType === 'all' || localType === 'track') && localSongs.length > 0 && (
            <View style={styles.section}>
              {localType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.track')}</Text>}
              {localSongs.slice(0, localType === 'all' ? 5 : undefined).map(item => (
                <View key={item.id}>{renderLocalSong({ item })}</View>
              ))}
            </View>
          )}
          {/* Artists section */}
          {(localType === 'all' || localType === 'artist') && localArtists.length > 0 && (
            <View style={styles.section}>
              {localType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.artist')}</Text>}
              {localArtists.slice(0, localType === 'all' ? 3 : undefined).map(item => (
                <View key={item.id}>{renderLocalArtist({ item })}</View>
              ))}
            </View>
          )}
          {/* Albums section */}
          {(localType === 'all' || localType === 'album') && localAlbums.length > 0 && (
            <View style={styles.section}>
              {localType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.album')}</Text>}
              {localAlbums.slice(0, localType === 'all' ? 3 : undefined).map(item => (
                <View key={item.id}>{renderLocalAlbum({ item })}</View>
              ))}
            </View>
          )}
          {localSongs.length === 0 && localArtists.length === 0 && localAlbums.length === 0 && (
            renderEmptyState('local')
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
          {/* Tracks section */}
          {(onlineType === 'all' || onlineType === 'track') && onlineTracks.length > 0 && (
            <View style={styles.section}>
              {onlineType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.track')}</Text>}
              {onlineTracks.slice(0, onlineType === 'all' ? 5 : undefined).map(item => (
                <View key={item.id}>{renderOnlineItem({ item })}</View>
              ))}
            </View>
          )}
          {/* Artists section */}
          {(onlineType === 'all' || onlineType === 'artist') && onlineArtists.length > 0 && (
            <View style={styles.section}>
              {onlineType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.artist')}</Text>}
              {onlineArtists.slice(0, onlineType === 'all' ? 3 : undefined).map(item => (
                <View key={item.id}>{renderOnlineArtist({ item })}</View>
              ))}
            </View>
          )}
          {/* Albums section */}
          {(onlineType === 'all' || onlineType === 'album') && onlineAlbums.length > 0 && (
            <View style={styles.section}>
              {onlineType === 'all' && <Text style={styles.sectionTitle}>{t('search.types.album')}</Text>}
              {onlineAlbums.slice(0, onlineType === 'all' ? 3 : undefined).map(item => (
                <View key={item.id}>{renderOnlineAlbum({ item })}</View>
              ))}
            </View>
          )}
          {onlineTracks.length === 0 && onlineArtists.length === 0 && onlineAlbums.length === 0 && (
            renderEmptyState('online')
          )}
        </ScrollView>
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
      {/* Online Album Detail Modal */}
      {selectedOnlineAlbum ? (
        <View style={styles.dialogOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} onPress={() => setSelectedOnlineAlbum(null)} />
          <View style={[styles.dialogContainer, styles.albumDialog]}>
            <View style={styles.albumHeader}>
              <ArtworkImage uri={selectedOnlineAlbum.image} size={80} fallbackLabel={selectedOnlineAlbum.title?.[0]?.toUpperCase()} />
              <View style={styles.albumHeaderInfo}>
                <Text style={styles.sheetTitle} numberOfLines={2}>{selectedOnlineAlbum.title}</Text>
                <Text style={styles.albumArtist}>{selectedOnlineAlbum.artistName}</Text>
                <Text style={styles.albumMeta}>{selectedOnlineAlbum.tracks.length} {t('search.types.track')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.downloadAllBtn, { backgroundColor: primary }]}
              onPress={() => {
                // Download all tracks from album
                for (const track of selectedOnlineAlbum.tracks) {
                  if (!existsInLibrary[track.id]) {
                    downloadMutation.mutate({
                      track: {
                        id: track.id,
                        title: track.title,
                        artistName: track.artistName,
                        albumTitle: selectedOnlineAlbum.title,
                        image: selectedOnlineAlbum.image,
                      },
                    });
                  }
                }
                setSelectedOnlineAlbum(null);
                Alert.alert(t('common.ok'), t('search.downloadQueued'));
              }}
            >
              <Icon name="download" size={18} color={onPrimary} />
              <Text style={[styles.downloadAllText, { color: onPrimary }]}>{t('search.downloadAll')}</Text>
            </TouchableOpacity>
            <ScrollView style={styles.albumTracksScroll}>
              {selectedOnlineAlbum.tracks.map((track, index) => {
                const inLibrary = existsInLibrary[track.id];
                return (
                  <View key={track.id} style={styles.albumTrackRow}>
                    <Text style={styles.trackNumber}>{index + 1}</Text>
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                      {track.duration && (
                        <Text style={styles.trackDuration}>
                          {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                        </Text>
                      )}
                    </View>
                    {inLibrary ? (
                      <Text style={styles.inLibraryBadge}>{t('search.inLibrary')}</Text>
                    ) : (
                      <TouchableOpacity
                        style={[styles.trackDownloadBtn, { backgroundColor: primary }]}
                        onPress={() => {
                          downloadMutation.mutate({
                            track: {
                              id: track.id,
                              title: track.title,
                              artistName: track.artistName,
                              albumTitle: selectedOnlineAlbum.title,
                              image: selectedOnlineAlbum.image,
                            },
                          });
                        }}
                      >
                        <Icon name="download" size={14} color={onPrimary} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setSelectedOnlineAlbum(null)}>
              <Text style={styles.dialogCancelText}>{t('common.close')}</Text>
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
    backgroundColor: '#0a0a0a',
    gap: 12,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
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
    backgroundColor: '#1a1a1a',
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
    backgroundColor: '#1a1a1a',
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
  resultsList: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inLibraryBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#1db954',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    overflow: 'hidden',
  },
  albumDialog: {
    maxHeight: '85%',
  },
  albumHeader: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  albumHeaderInfo: {
    flex: 1,
    gap: 4,
  },
  albumArtist: {
    color: '#b3b3b3',
    fontSize: 14,
  },
  albumMeta: {
    color: '#6a6a6a',
    fontSize: 12,
  },
  downloadAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
  },
  downloadAllText: {
    fontSize: 15,
    fontWeight: '600',
  },
  albumTracksScroll: {
    maxHeight: 300,
  },
  albumTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
  },
  trackNumber: {
    width: 24,
    color: '#6a6a6a',
    fontSize: 14,
    textAlign: 'center',
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 15,
  },
  trackDuration: {
    color: '#6a6a6a',
    fontSize: 12,
  },
  trackDownloadBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SearchScreen;
