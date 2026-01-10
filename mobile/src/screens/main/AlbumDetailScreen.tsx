import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import type { LibraryStackParamList } from '../../navigation/types';
import type { Song } from '../../types/models';
import { playSong } from '../../services/player/PlayerService';
import ArtworkImage from '../../components/ArtworkImage';
import { addTrackToPlaylist, fetchAlbumTracks, fetchPlaylists } from '../../api/service';
import { useLanguage } from '../../context/LanguageContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useAutoDownloadNewTracks } from '../../hooks/useAutoDownloadNewTracks';

type Props = NativeStackScreenProps<LibraryStackParamList, 'AlbumDetail'>;

const AlbumDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { artistName, albumTitle, songs: initialSongs } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const connectivity = useConnectivity();
  const autoDownloadNewTrack = useAutoDownloadNewTracks();
  const { primary, onPrimary } = useAccentColor();

  const [trackMenuVisible, setTrackMenuVisible] = useState(false);
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Song | null>(null);
  const [addingPlaylistId, setAddingPlaylistId] = useState<number | null>(null);

  // If songs are not passed, fetch them
  const { data: fetchedSongs } = useQuery({
    queryKey: ['album', albumTitle, 'tracks'],
    queryFn: () => fetchAlbumTracks(albumTitle),
    enabled: !initialSongs || initialSongs.length === 0,
  });

  const songs = useMemo(() => {
    return initialSongs && initialSongs.length > 0 ? initialSongs : fetchedSongs || [];
  }, [initialSongs, fetchedSongs]);

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
    enabled: !connectivity.isOffline,
  });

  const handlePlay = () => {
    if (!songs.length) {
      return;
    }
    const [first, ...rest] = songs;
    playSong(first, rest).catch(error =>
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error')),
    );
  };

  const openTrackMenu = (track: Song) => {
    setSelectedTrack(track);
    setTrackMenuVisible(true);
  };

  const closeTrackMenu = () => {
    setTrackMenuVisible(false);
    setSelectedTrack(null);
  };

  const handleAddToPlaylist = async (playlistId: number) => {
    if (!selectedTrack) {
      return;
    }
    try {
      setAddingPlaylistId(playlistId);
      await addTrackToPlaylist(playlistId, selectedTrack.id);
      Alert.alert(t('common.ok'), t('common.addedToPlaylist'));
      const targetPlaylist = playlists.find(item => item.id === playlistId);
      autoDownloadNewTrack(targetPlaylist, selectedTrack);
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.unableToAddTrack'));
    } finally {
      setAddingPlaylistId(null);
      setPlaylistPickerVisible(false);
      setSelectedTrack(null);
    }
  };


  useLayoutEffect(() => {
    navigation.setOptions({
      title: albumTitle ?? t('library.albums'),
    });
  }, [albumTitle, navigation, t]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.muted}>{artistName ?? t('library.unknownArtist')}</Text>
            <Text style={styles.title}>{albumTitle}</Text>
            <Text style={styles.subtitle}>{t('playlist.trackCount', { count: songs.length })}</Text>
            <TouchableOpacity style={[styles.playBtn, { backgroundColor: primary }]} onPress={handlePlay}>
              <Icon name="play" size={18} color={onPrimary} />
              <Text style={[styles.playBtnText, { color: onPrimary }]}>{t('home.play') ?? 'Play'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.coverWrapper}>
            <ArtworkImage
              uri={songs[0]?.albumCover ?? null}
              size={120}
              fallbackLabel={albumTitle?.[0]?.toUpperCase() ?? 'A'}
            />
          </View>
        </View>

        <View style={styles.trackList}>
          {songs.map((track, index) => (
            <TouchableOpacity
              key={track.id}
              style={styles.trackRow}
              onPress={() => {
                const queue = songs.slice(index + 1);
                playSong(track, queue).catch(() => { });
              }}
            >
              <View style={styles.trackMeta}>
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {track.title ?? t('library.unknownAlbum')}
                </Text>
                <Text style={styles.trackSubtitle} numberOfLines={1}>
                  {track.artist ?? t('library.unknownArtist')}
                </Text>
              </View>
              <View style={styles.trackActions}>
                <Text style={styles.trackDuration}>
                  {track.duration ? `${Math.floor(track.duration / 60)}:${`${track.duration % 60}`.padStart(2, '0')}` : '--:--'}
                </Text>
                <TouchableOpacity style={styles.trackMenuBtn} onPress={() => openTrackMenu(track)}>
                  <Icon name="more-vertical" size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal transparent visible={trackMenuVisible} animationType="fade" onRequestClose={closeTrackMenu}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeTrackMenu} />
          <View style={styles.dialogCard}>
            <Text style={styles.sheetTitle}>{selectedTrack?.title ?? t('common.trackActions')}</Text>
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setTrackMenuVisible(false);
                setPlaylistPickerVisible(true);
              }}
            >
              <Icon name="plus-circle" size={18} color="#ffffff" />
              <Text style={styles.sheetActionText}>{t('common.addToPlaylist')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetAction} onPress={closeTrackMenu}>
              <Icon name="x" size={18} color="#ffffff" />
              <Text style={styles.sheetActionText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={playlistPickerVisible}
        animationType="fade"
        onRequestClose={() => setPlaylistPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setPlaylistPickerVisible(false)}
          />
          <View style={[styles.dialogCard, styles.playlistDialog]}>
            <Text style={styles.sheetTitle}>{t('playlist.choosePlaylist')}</Text>
            {playlists.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('search.noPlaylistsAction')}</Text>
            ) : (
              <ScrollView style={styles.playlistScroll} contentContainerStyle={styles.playlistList}>
                {playlists.map(playlist => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.sheetAction}
                    onPress={() => handleAddToPlaylist(playlist.id)}
                    disabled={addingPlaylistId === playlist.id}
                  >
                    {addingPlaylistId === playlist.id ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Icon name="folder-plus" size={18} color="#ffffff" />
                    )}
                    <Text style={styles.sheetActionText}>{playlist.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setPlaylistPickerVisible(false);
                setSelectedTrack(null);
              }}
            >
              <Icon name="x" size={18} color="#ffffff" />
              <Text style={styles.sheetActionText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  headerInfo: {
    flex: 1,
    gap: 6,
  },
  muted: {
    color: '#9090a5',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9090a5',
  },
  playBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  playBtnText: {
    color: 'rgba(5,5,5,0.8)',
    fontWeight: '600',
  },
  coverWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  trackList: {
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1b1b1b',
  },
  trackMeta: {
    flex: 1,
    gap: 4,
  },
  trackTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  trackSubtitle: {
    color: '#9090a5',
    fontSize: 12,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trackDuration: {
    color: '#9090a5',
    fontSize: 12,
  },
  trackMenuBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    backgroundColor: '#050505',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
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
  playlistDialog: {
    maxHeight: '70%',
  },
  sheetEmpty: {
    color: '#9090a5',
    fontSize: 14,
  },
  playlistScroll: {
    maxHeight: 260,
  },
  playlistList: {
    gap: 8,
  },
});

export default AlbumDetailScreen;
