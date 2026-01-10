import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import {
  addTrackToPlaylist,
  deletePlaylist,
  fetchPlaylistTracks,
  removeTrackFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  fetchPlaylists,
} from '../../api/service';
import { useOffline } from '../../context/OfflineContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import type { LibraryStackParamList } from '../../navigation/types';
import type { Playlist, Song } from '../../types/models';
import ArtworkImage from '../../components/ArtworkImage';
import { playSong } from '../../services/player/PlayerService';
import { useLanguage } from '../../context/LanguageContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { useAutoDownloadNewTracks } from '../../hooks/useAutoDownloadNewTracks';

type Props = NativeStackScreenProps<LibraryStackParamList, 'PlaylistDetail'>;
const ROW_HEIGHT = 76;

const PlaylistDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { primary, onPrimary } = useAccentColor();
  const { playlistId, playlistName: initialName, description: initialDescription, coverUrl: initialCover } = route.params;
  const queryClient = useQueryClient();
  const { state: offlineState, downloadPlaylist, removePlaylist, isPlaylistDownloaded } =
    useOffline();
  const connectivity = useConnectivity();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const autoDownloadNewTrack = useAutoDownloadNewTracks();

  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(initialName ?? '');
  const [descInput, setDescInput] = useState(initialDescription ?? '');
  const [orderedTracks, setOrderedTracks] = useState<Song[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [trackMenuVisible, setTrackMenuVisible] = useState(false);
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Song | null>(null);
  const trackMenuAnim = useRef(new Animated.Value(60)).current;
  const playlistPickerAnim = useRef(new Animated.Value(60)).current;

  const orderedTracksRef = useRef<Song[]>([]);
  const dragIndexRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);

  const { data: tracks = [], isLoading, refetch } = useQuery({
    queryKey: ['playlists', playlistId, 'tracks'],
    queryFn: () => fetchPlaylistTracks(playlistId),
    enabled: !connectivity.isOffline,
  });

  const {
    data: availablePlaylists = [],
    isLoading: playlistsLoading,
  } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
    enabled: !connectivity.isOffline,
  });

  const playlistMeta = availablePlaylists.find(item => item.id === playlistId);
  const selectablePlaylists = useMemo(
    () => availablePlaylists.filter(item => item.id !== playlistId),
    [availablePlaylists, playlistId],
  );
  const canAddToPlaylist = selectablePlaylists.length > 0 && !connectivity.isOffline;

  const derivedName = playlistMeta?.name ?? initialName ?? t('playlist.untitled');
  const derivedDesc = playlistMeta?.description ?? initialDescription ?? '';
  const derivedCover = playlistMeta?.coverUrl ?? initialCover ?? null;
  const derivedTrackCount = playlistMeta?.trackCount ?? route.params.trackCount ?? tracks.length;
  const playlistProgress = offlineState.downloadProgress[playlistId] ?? 0;
  const isDownloading = offlineState.activePlaylists.includes(playlistId);
  const isDownloaded = isPlaylistDownloaded(playlistId);

  const offlineTracks = useMemo(() => {
    if (!connectivity.isOffline) {
      return [];
    }
    const entry = offlineState.playlists[playlistId];
    if (!entry) {
      return [];
    }
    return entry.songIds
      .map(id => offlineState.tracks[id]?.song)
      .filter((song): song is Song => Boolean(song));
  }, [connectivity.isOffline, offlineState.playlists, offlineState.tracks, playlistId]);

  const baseTracks = useMemo(
    () => (connectivity.isOffline ? offlineTracks : tracks),
    [connectivity.isOffline, offlineTracks, tracks],
  );

  useEffect(() => {
    if (!isEditing) {
      setNameInput(derivedName);
      setDescInput(derivedDesc);
    }
  }, [derivedName, derivedDesc, isEditing]);

  useEffect(() => {
    if (!orderDirty || !isEditing) {
      setOrderedTracks(baseTracks);
      orderedTracksRef.current = baseTracks;
    }
  }, [baseTracks, orderDirty, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setOrderedTracks(baseTracks);
      orderedTracksRef.current = baseTracks;
      setOrderDirty(false);
      setDraggingIndex(null);
      dragIndexRef.current = null;
      dragOffsetRef.current = 0;
    }
  }, [isEditing, baseTracks]);

  useEffect(() => {
    orderedTracksRef.current = orderedTracks;
  }, [orderedTracks]);

  useEffect(() => {
    if (trackMenuVisible) {
      trackMenuAnim.setValue(60);
      Animated.timing(trackMenuAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      trackMenuAnim.setValue(60);
    }
  }, [trackMenuAnim, trackMenuVisible]);

  useEffect(() => {
    if (playlistPickerVisible) {
      playlistPickerAnim.setValue(60);
      Animated.timing(playlistPickerAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      playlistPickerAnim.setValue(60);
    }
  }, [playlistPickerAnim, playlistPickerVisible]);

  const displayName = isEditing ? nameInput : derivedName;
  const displayDesc = isEditing ? descInput : derivedDesc;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = nameInput.trim() || 'Untitled Playlist';
      const hasMetaChanges =
        trimmedName !== (derivedName ?? '') || (descInput ?? '') !== (derivedDesc ?? '');
      const operations: Array<Promise<void>> = [];
      if (hasMetaChanges) {
        operations.push(updatePlaylist(playlistId, { name: trimmedName, description: descInput }));
      }
      if (orderDirty) {
        const orders = orderedTracksRef.current.map((track, index) => ({
          musicId: track.id,
          position: index + 1,
        }));
        operations.push(reorderPlaylist(playlistId, orders));
      }
      if (operations.length === 0) {
        return false;
      }
      await Promise.all(operations);
      return true;
    },
    onSuccess: changed => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlists', playlistId, 'tracks'] });
      setIsEditing(false);
      setOrderDirty(false);
      setDraggingIndex(null);
      dragIndexRef.current = null;
      dragOffsetRef.current = 0;
      if (changed) {
        Alert.alert(t('common.ok'), t('playlist.updated'));
      }
    },
    onError: error =>
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePlaylist(playlistId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      navigation.goBack();
    },
    onError: error =>
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error')),
  });

  const removeTrackMutation = useMutation({
    mutationFn: (musicId: number) => removeTrackFromPlaylist(playlistId, musicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists', playlistId, 'tracks'] });
      refetch();
    },
    onError: () => Alert.alert('Error', 'Failed to remove track'),
  });

  const handleDelete = () => {
    Alert.alert(t('playlist.delete'), t('playlist.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('playlist.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleRemoveTrack = (song: Song) => {
    Alert.alert(t('playlist.removeTitle'), t('playlist.removePrompt', { track: song.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.removeFromPlaylist'), style: 'destructive', onPress: () => removeTrackMutation.mutate(song.id) },
    ]);
  };

  const handleDownloadOffline = async () => {
    if (baseTracks.length === 0) {
      Alert.alert(t('playlist.noTracksTitle'), t('library.noTracksDownload'));
      return;
    }
    const playlistPayload: Playlist = {
      id: playlistId,
      name: derivedName,
      description: derivedDesc,
      coverUrl: derivedCover,
      trackCount: derivedTrackCount ?? baseTracks.length,
    };
    await downloadPlaylist(playlistPayload, baseTracks);
    Alert.alert(t('common.ok'), t('library.downloadStarted'));
  };

  const handleRemoveOffline = async () => {
    Alert.alert(t('playlist.removeOfflineTitle'), t('playlist.removeOfflineConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('playlist.delete'),
        style: 'destructive',
        onPress: async () => {
          await removePlaylist(playlistId);
        },
      },
    ]);
  };

  const handlePlaySong = useCallback(
    (song: Song) => {
      const selectedIndex = baseTracks.findIndex(track => track.id === song.id);
      const queue =
        selectedIndex >= 0
          ? [
            ...baseTracks.slice(selectedIndex + 1),
            ...baseTracks.slice(0, selectedIndex),
          ]
          : baseTracks.filter(track => track.id !== song.id);
      playSong(song, queue).catch(error => console.error('Failed to start playback', error));
    },
    [baseTracks],
  );

  const handleAddSongsShortcut = useCallback(() => {
    // Navigate to Search tab from nested Library stack
    // navigation.getParent() gets LibraryStack navigator
    // navigation.getParent().getParent() gets the Tab navigator
    const libraryNav = navigation.getParent();
    const tabNav = libraryNav?.getParent?.();
    if (tabNav) {
      tabNav.navigate('Search' as never);
    }
  }, [navigation]);

  const handleRemoveSelectedTrack = () => {
    if (!selectedTrack) {
      return;
    }
    const target = selectedTrack;
    closeTrackMenu();
    handleRemoveTrack(target);
  };

  const openTrackMenu = (song: Song) => {
    setSelectedTrack(song);
    setTrackMenuVisible(true);
  };

  const closeTrackMenu = () => {
    setTrackMenuVisible(false);
    setSelectedTrack(null);
  };

  const openPlaylistPicker = () => {
    setTrackMenuVisible(false);
    setPlaylistPickerVisible(true);
  };

  const closePlaylistPicker = () => {
    setPlaylistPickerVisible(false);
    if (!trackMenuVisible) {
      setSelectedTrack(null);
    }
  };

  const handleAddTrackToAnotherPlaylist = async (targetPlaylistId: number) => {
    if (!selectedTrack) {
      return;
    }
    try {
      await addTrackToPlaylist(targetPlaylistId, selectedTrack.id);
      Alert.alert(t('common.ok'), t('common.addedToPlaylist'));
      const targetPlaylist = availablePlaylists.find(item => item.id === targetPlaylistId);
      autoDownloadNewTrack(targetPlaylist, selectedTrack);
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('common.unableToAddTrack'),
      );
    } finally {
      closePlaylistPicker();
    }
  };


  const startDrag = (index: number) => {
    if (!isEditing) {
      return;
    }
    dragIndexRef.current = index;
    dragOffsetRef.current = 0;
    setDraggingIndex(index);
  };

  const finishDrag = () => {
    dragIndexRef.current = null;
    dragOffsetRef.current = 0;
    setDraggingIndex(null);
  };

  const shiftTrack = useCallback((from: number, to: number) => {
    setOrderedTracks(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      orderedTracksRef.current = next;
      return next;
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => dragIndexRef.current !== null,
      onMoveShouldSetPanResponder: () => dragIndexRef.current !== null,
      onPanResponderMove: (_, gesture) => {
        if (dragIndexRef.current === null) {
          return;
        }
        const threshold = ROW_HEIGHT * 0.6;
        const delta = gesture.dy - dragOffsetRef.current;
        if (delta > threshold && dragIndexRef.current < orderedTracksRef.current.length - 1) {
          const newIndex = dragIndexRef.current + 1;
          shiftTrack(dragIndexRef.current, newIndex);
          dragIndexRef.current = newIndex;
          dragOffsetRef.current += ROW_HEIGHT;
          setDraggingIndex(newIndex);
          setOrderDirty(true);
        } else if (delta < -threshold && dragIndexRef.current > 0) {
          const newIndex = dragIndexRef.current - 1;
          shiftTrack(dragIndexRef.current, newIndex);
          dragIndexRef.current = newIndex;
          dragOffsetRef.current -= ROW_HEIGHT;
          setDraggingIndex(newIndex);
          setOrderDirty(true);
        }
      },
      onPanResponderRelease: () => finishDrag(),
      onPanResponderTerminate: () => finishDrag(),
    }),
  ).current;

  const handleSave = () => {
    if (updateMutation.isPending) {
      return;
    }
    updateMutation.mutate();
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setNameInput(derivedName);
    setDescInput(derivedDesc);
    setOrderedTracks(tracks);
    orderedTracksRef.current = tracks;
    setOrderDirty(false);
    finishDrag();
  };

  const displayedTracks = isEditing ? orderedTracks : baseTracks;

  const renderTrack = ({ item, index }: { item: Song; index: number }) => (
    <TouchableOpacity
      style={[
        styles.trackRow,
        isEditing && draggingIndex === index && styles.draggingRow,
      ]}
      onPress={!isEditing ? () => handlePlaySong(item) : undefined}
      activeOpacity={isEditing ? 0.85 : 0.6}
    >
      <Text style={styles.trackNumber}>{index + 1}</Text>
      <ArtworkImage
        uri={item.albumCover}
        size={48}
        fallbackLabel={item.title?.[0]?.toUpperCase()}
      />
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
      {offlineState.tracks[item.id] ? (
        <Icon name="check-circle" size={16} color="#4ade80" style={styles.downloadedIcon} />
      ) : null}
      <Text style={styles.trackDuration}>
        {item.duration
          ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`
          : '--:--'}
      </Text>
      {isEditing ? (
        <TouchableOpacity
          style={styles.dragHandle}
          onLongPress={() => startDrag(index)}
          delayLongPress={120}
        >
          <Icon name="move" size={18} color="#9ca3af" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.trackMenuButton} onPress={() => openTrackMenu(item)}>
          <Icon name="more-vertical" size={18} color="#ffffff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const waitingForRemote = !connectivity.isOffline && isLoading && baseTracks.length === 0;

  if (waitingForRemote) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#ffffff" />
        <Text style={styles.loadingText}>{t('playlist.loading')}</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      {...(isEditing ? panResponder.panHandlers : {})}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-left" size={22} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.coverWrapper}>
            <ArtworkImage
              uri={derivedCover ?? tracks[0]?.albumCover ?? null}
              size={84}
              fallbackLabel={displayName?.[0]?.toUpperCase()}
            />
          </View>
          <View style={styles.headerInfo}>
            {isEditing ? (
              <>
                <TextInput
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder={t('playlist.namePlaceholder')}
                  placeholderTextColor="#606072"
                />
                <TextInput
                  style={styles.descInput}
                  value={descInput}
                  onChangeText={setDescInput}
                  placeholder={t('playlist.descriptionPlaceholder')}
                  placeholderTextColor="#606072"
                />
              </>
            ) : (
              <>
                <Text style={styles.playlistName}>{displayName}</Text>
                {displayDesc ? <Text style={styles.playlistDesc}>{displayDesc}</Text> : null}
                <Text style={styles.trackCount}>
                  {t('playlist.trackCount', { count: derivedTrackCount ?? tracks.length })}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {isEditing ? (
          <>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleSave}
              disabled={updateMutation.isPending}
            >
              <View style={styles.actionContent}>
                <Icon
                  name="save"
                  size={16}
                  color={updateMutation.isPending ? '#a3a3b3' : '#ffffff'}
                />
                <Text style={styles.actionText}>
                  {updateMutation.isPending ? '...' : t('playlist.save')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCancelEditing}>
              <View style={styles.actionContent}>
                <Icon name="x" size={16} color="#ffffff" />
                <Text style={styles.actionText}>{t('playlist.cancel')}</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setNameInput(derivedName);
                setDescInput(derivedDesc);
                setIsEditing(true);
              }}
            >
              <View style={styles.actionContent}>
                <Icon name="edit-3" size={16} color="#ffffff" />
                <Text style={styles.actionText}>{t('playlist.edit')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
              <View style={styles.actionContent}>
                <Icon name="trash-2" size={16} color="#ff6b6b" />
                <Text style={styles.actionTextDanger}>{t('playlist.delete')}</Text>
              </View>
            </TouchableOpacity>
            {isDownloading ? (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDisabled]} disabled>
                <View style={styles.actionContent}>
                  <Icon name="download" size={16} color="#ffffff" />
                  <Text style={styles.actionText}>
                    {t('playlist.downloading', { percent: Math.round(playlistProgress * 100) })}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : isDownloaded ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: primary }]}
                onPress={handleRemoveOffline}
              >
                <View style={styles.actionContent}>
                  <Icon name="check-circle" size={16} color={onPrimary} />
                  <Text style={[styles.actionTextOnBright, { color: onPrimary }]}>{t('playlist.downloaded')}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtn} onPress={handleDownloadOffline}>
                <View style={styles.actionContent}>
                  <Icon name="download" size={16} color="#ffffff" />
                  <Text style={styles.actionText}>{t('playlist.saveOffline')}</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Tracks */}
      <FlatList
        data={displayedTracks}
        renderItem={renderTrack}
        keyExtractor={item => `${item.id}`}
        scrollEnabled={!isEditing || draggingIndex === null}
        contentContainerStyle={[
          displayedTracks.length === 0 && styles.emptyContainer,
          styles.listContentPadding,
        ]}
        ListEmptyComponent={
          <View style={styles.centered}>
            <View style={styles.emptyIconCircle}>
              <Icon name="music" size={32} color="#8aa4ff" />
            </View>
            <Text style={styles.emptyText}>{t('library.emptyPlaylist')}</Text>
            <TouchableOpacity style={[styles.emptyAction, { backgroundColor: primary }]} onPress={handleAddSongsShortcut}>
              <Icon name="plus" size={16} color={onPrimary} />
              <Text style={[styles.emptyActionText, { color: onPrimary }]}>{t('playlist.emptyCta')}</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <Modal
        transparent
        visible={trackMenuVisible}
        animationType="fade"
        onRequestClose={closeTrackMenu}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeTrackMenu} />
        <Animated.View
          style={[
            styles.sheetContainer,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: trackMenuAnim }] },
          ]}
        >
          <Text style={styles.sheetTitle}>
            {selectedTrack?.title ?? t('playlist.optionsTitle')}
          </Text>
          <View style={styles.sheetSection}>
            <TouchableOpacity
              style={[styles.sheetAction, !canAddToPlaylist && styles.sheetActionDisabled]}
              onPress={() => {
                if (!canAddToPlaylist) {
                  Alert.alert(t('common.unavailable'), t('common.noPlaylists'));
                  return;
                }
                openPlaylistPicker();
              }}
              disabled={!canAddToPlaylist}
            >
              <Icon name="plus-circle" size={18} color="#ffffff" />
              <Text style={styles.sheetActionText}>{t('common.addToPlaylist')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={handleRemoveSelectedTrack}
            >
              <Icon name="minus-circle" size={18} color="#fbbf24" />
              <Text style={styles.sheetActionText}>{t('common.removeFromPlaylist')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.sheetAction} onPress={closeTrackMenu}>
            <Icon name="x" size={18} color="#ffffff" />
            <Text style={styles.sheetActionText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
      <Modal
        transparent
        visible={playlistPickerVisible}
        animationType="fade"
        onRequestClose={closePlaylistPicker}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closePlaylistPicker} />
        <Animated.View
          style={[
            styles.sheetContainer,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: playlistPickerAnim }] },
          ]}
        >
          <Text style={styles.sheetTitle}>{t('playlist.choosePlaylist')}</Text>
          {playlistsLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : selectablePlaylists.length === 0 ? (
            <Text style={styles.sheetEmpty}>{t('playlist.noOtherPlaylists')}</Text>
          ) : (
            <FlatList
              data={selectablePlaylists}
              keyExtractor={item => `${item.id}`}
              style={styles.playlistList}
              contentContainerStyle={styles.playlistListContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.sheetAction}
                  onPress={() => handleAddTrackToAnotherPlaylist(item.id)}
                >
                  <Icon name="folder-plus" size={18} color="#ffffff" />
                  <Text style={styles.sheetActionText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity style={styles.sheetAction} onPress={closePlaylistPicker}>
            <Icon name="x" size={18} color="#ffffff" />
            <Text style={styles.sheetActionText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#e6e6f2',
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  coverWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    gap: 8,
    flex: 1,
  },
  playlistName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  playlistDesc: {
    fontSize: 14,
    color: '#9090a5',
  },
  trackCount: {
    fontSize: 14,
    color: '#9090a5',
  },
  nameInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: '#121212',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  descInput: {
    fontSize: 14,
    color: '#ffffff',
    backgroundColor: '#121212',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexWrap: 'wrap',
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#121212',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnSuccess: {},
  actionTextOnBright: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionTextDanger: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#282828',
    minHeight: 76,
  },
  draggingRow: {
    backgroundColor: '#11111b',
  },
  trackNumber: {
    width: 24,
    color: '#9090a5',
    fontSize: 14,
  },
  trackInfo: {
    flex: 1,
    gap: 4,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  trackArtist: {
    color: '#9090a5',
    fontSize: 13,
  },
  trackDuration: {
    color: '#9090a5',
    fontSize: 14,
  },
  downloadedIcon: {
    marginRight: 8,
  },
  dragHandle: {
    padding: 8,
    marginLeft: 4,
  },
  trackMenuButton: {
    padding: 8,
    marginLeft: 4,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  listContentPadding: {
    paddingBottom: 120,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#15151f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#9090a5',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0d0d14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSection: {
    gap: 12,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  sheetActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetDangerText: {
    color: '#f87171',
  },
  sheetEmpty: {
    color: '#9090a5',
    fontSize: 14,
  },
  sheetActionDisabled: {
    opacity: 0.5,
  },
  playlistList: {
    maxHeight: 260,
  },
  playlistListContent: {
    gap: 8,
  },
});

export default PlaylistDetailScreen;
