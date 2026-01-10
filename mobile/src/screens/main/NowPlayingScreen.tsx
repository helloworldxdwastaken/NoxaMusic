import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Animated,
  Easing,
  GestureResponderEvent,
  ImageBackground,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import TrackPlayer, {
  Event,
  RepeatMode,
  Track,
  useProgress,
  useTrackPlayerEvents,
  State as TrackState,
} from 'react-native-track-player';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppStackParamList } from '../../navigation/types';
import { useCurrentTrack } from '../../hooks/useCurrentTrack';
import ArtworkImage from '../../components/ArtworkImage';
import { playSong, togglePlayback } from '../../services/player/PlayerService';
import { addTrackToPlaylist, fetchPlaylists, fetchArtistTracks } from '../../api/service';
import { fetchLyrics, parseSyncedLyrics, parsePlainLyrics, ParsedLyricLine } from '../../api/lyrics';
import type { Playlist, Song } from '../../types/models';
import { useLanguage } from '../../context/LanguageContext';
import { useAutoDownloadNewTracks } from '../../hooks/useAutoDownloadNewTracks';
import { useMiniPlayerVisibility } from '../../context/MiniPlayerContext';
import { useAccentColor } from '../../hooks/useAccentColor';

const trackToSong = (playerTrack: Track): Song => ({
  id: Number(playerTrack.id),
  title: playerTrack.title ?? 'Unknown',
  artist: playerTrack.artist ?? 'Unknown Artist',
  album: playerTrack.album ?? undefined,
  duration: typeof playerTrack.duration === 'number' ? playerTrack.duration : undefined,
  albumCover: typeof playerTrack.artwork === 'string' ? playerTrack.artwork : undefined,
});

type Props = NativeStackScreenProps<AppStackParamList, 'NowPlaying'>;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const NowPlayingScreen: React.FC<Props> = ({ navigation }) => {
  const { track, state } = useCurrentTrack();
  const { t } = useLanguage();
  const autoDownloadNewTrack = useAutoDownloadNewTracks();
  const { hide, show } = useMiniPlayerVisibility();
  const progress = useProgress(250);
  const [queue, setQueue] = useState<Track[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.Queue);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [syncedLyrics, setSyncedLyrics] = useState<ParsedLyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState(false);
  const lastHighlightedIndex = useRef<number>(-1);
  const isPlaying = state === TrackState.Playing || state === TrackState.Buffering;
  const insets = useSafeAreaInsets();
  const glowAnim = useRef(new Animated.Value(isPlaying ? 1 : 0)).current;
  const lyricTransitionAnim = useRef(new Animated.Value(0)).current;
  const shuffleBackupRef = useRef<Track[] | null>(null);
  const shuffleEnabledRef = useRef(false);
  const shuffleToggleInProgressRef = useRef(false);
  const { primary, onPrimary } = useAccentColor();

  const loadQueue = useCallback(async () => {
    try {
      const currentQueue = await TrackPlayer.getQueue();
      setQueue(currentQueue);
    } catch {
      setQueue([]);
    }
  }, []);

  const handleSelectTrack = useCallback(
    async (target: Track) => {
      const targetIndex = queue.findIndex(item => item.id === target.id);
      if (targetIndex >= 0) {
        try {
          await TrackPlayer.skip(targetIndex);
          return;
        } catch {
          // fall back to manual playback reset below
        }
      }
      const song = trackToSong(target);
      const upcoming = queue
        .filter(item => item.id !== target.id)
        .map(item => trackToSong(item));
      await playSong(song, upcoming);
      await loadQueue();
    },
    [queue, loadQueue],
  );

  const loadPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const list = await fetchPlaylists();
      setPlaylists(list);
    } catch (error) {
      console.error('Failed to load playlists', error);
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue]),
  );

  useTrackPlayerEvents([Event.PlaybackTrackChanged, Event.PlaybackQueueEnded], () => {
    loadQueue();
  });

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      hide();
      TrackPlayer.getRepeatMode()
        .then(mode => {
          if (mounted) {
            setRepeatMode(mode);
          }
        })
        .catch(() => { });
      return () => {
        mounted = false;
        show();
      };
    }, [hide, show]),
  );

  useEffect(() => {
    if ((actionsVisible || playlistPickerVisible) && playlists.length === 0 && !loadingPlaylists) {
      loadPlaylists();
    }
  }, [actionsVisible, playlistPickerVisible, playlists.length, loadingPlaylists, loadPlaylists]);

  const activeIndex = useMemo(
    () => queue.findIndex(item => item.id === track?.id),
    [queue, track?.id],
  );

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isPlaying ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [glowAnim, isPlaying]);

  const artworkAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.92, 1],
          }),
        },
      ],
      shadowOpacity: glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.12, 0.28],
      }),
      shadowRadius: glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [12, 20],
      }),
    }),
    [glowAnim],
  );

  const duration = track?.duration ?? progress.duration;
  const position = progress.position;
  const progressPct = duration ? Math.min(100, (position / duration) * 100) : 0;
  const canShuffle = queue.length > 1;
  const backgroundSource = useMemo(() => {
    if (track?.artwork && typeof track.artwork === 'string') {
      return { uri: track.artwork };
    }
    return null;
  }, [track?.artwork]);

  const handleSkipNext = async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // ignore
    }
  };

  const handleSkipPrev = async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      // ignore
    }
  };

  const handleRepeatToggle = async () => {
    const nextMode =
      repeatMode === RepeatMode.Off
        ? RepeatMode.Queue
        : repeatMode === RepeatMode.Queue
          ? RepeatMode.Track
          : RepeatMode.Off;
    setRepeatMode(nextMode);
    await TrackPlayer.setRepeatMode(nextMode);
  };

  const handleArtistPress = useCallback(async () => {
    if (!track?.artist) {
      return;
    }
    try {
      const artistTracks = await fetchArtistTracks(track.artist);
      navigation.navigate('ArtistDetail', {
        artistName: track.artist,
        songs: artistTracks,
      });
    } catch {
      Alert.alert(t('common.error'), t('common.error'));
    }
  }, [track?.artist, navigation, t]);

  // Fetch lyrics when track changes
  useEffect(() => {
    const loadLyrics = async () => {
      if (!track?.title || !track?.artist) {
        setSyncedLyrics([]);
        setPlainLyrics([]);
        setLyricsError(false);
        return;
      }

      setLyricsLoading(true);
      setLyricsError(false);
      lastHighlightedIndex.current = -1;

      try {
        const result = await fetchLyrics(
          track.title,
          track.artist,
          track.album ?? undefined,
          track.duration ?? undefined,
        );

        if (result) {
          if (result.syncedLyrics) {
            setSyncedLyrics(parseSyncedLyrics(result.syncedLyrics));
            setPlainLyrics([]);
          } else if (result.plainLyrics) {
            setSyncedLyrics([]);
            setPlainLyrics(parsePlainLyrics(result.plainLyrics));
          } else if (result.instrumental) {
            setSyncedLyrics([]);
            setPlainLyrics(['♪ Instrumental ♪']);
          } else {
            setSyncedLyrics([]);
            setPlainLyrics([]);
            setLyricsError(true);
          }
        } else {
          setSyncedLyrics([]);
          setPlainLyrics([]);
          setLyricsError(true);
        }
      } catch {
        setSyncedLyrics([]);
        setPlainLyrics([]);
        setLyricsError(true);
      } finally {
        setLyricsLoading(false);
      }
    };

    loadLyrics();
  }, [track?.id, track?.title, track?.artist, track?.album, track?.duration]);

  // Get current lyric line index for synced lyrics
  const currentLyricIndex = useMemo(() => {
    if (syncedLyrics.length === 0) {
      return -1;
    }
    const currentTime = progress.position;
    for (let i = syncedLyrics.length - 1; i >= 0; i--) {
      if (syncedLyrics[i].time <= currentTime) {
        return i;
      }
    }
    return -1;
  }, [syncedLyrics, progress.position]);

  // Animate lyrics transition when index changes
  useEffect(() => {
    if (currentLyricIndex >= 0 && currentLyricIndex !== lastHighlightedIndex.current && lyricsVisible) {
      lastHighlightedIndex.current = currentLyricIndex;
      // Smooth scroll-up animation
      lyricTransitionAnim.setValue(1);
      Animated.timing(lyricTransitionAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [currentLyricIndex, lyricsVisible, lyricTransitionAnim]);

  const handleLyricsToggle = useCallback(() => {
    setLyricsVisible(prev => !prev);
  }, []);

  const shuffleArray = useCallback((items: Track[]) => {
    const clone = [...items];
    for (let i = clone.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = clone[i];
      clone[i] = clone[j];
      clone[j] = temp;
    }
    return clone;
  }, []);

  useEffect(() => {
    shuffleEnabledRef.current = shuffleEnabled;
  }, [shuffleEnabled]);

  const handleShuffleToggle = useCallback(async () => {
    if (!track || !canShuffle || shuffleToggleInProgressRef.current) {
      return;
    }
    shuffleToggleInProgressRef.current = true;
    const currentPosition = position;
    const wasPlaying = isPlaying;
    try {
      if (!shuffleEnabledRef.current) {
        // Enable shuffle
        shuffleBackupRef.current = queue;
        const currentTrack = queue.find(item => item.id === track.id);
        const rest = queue.filter(item => item.id !== track.id);
        const shuffledRest = shuffleArray(rest);
        const newQueue = currentTrack ? [currentTrack, ...shuffledRest] : shuffledRest;
        await TrackPlayer.reset();
        await TrackPlayer.add(newQueue);
        if (currentTrack) {
          await TrackPlayer.skip(0); // Skip to first track (current track)
          if (Number.isFinite(currentPosition) && currentPosition > 0) {
            await TrackPlayer.seekTo(currentPosition);
          }
          if (wasPlaying) {
            await TrackPlayer.play();
          }
        }
        setQueue(newQueue);
        shuffleEnabledRef.current = true;
        setShuffleEnabled(true);
      } else {
        // Disable shuffle
        const originalQueue = shuffleBackupRef.current ?? queue;
        const currentTrackIndex = originalQueue.findIndex(item => item.id === track.id);
        await TrackPlayer.reset();
        await TrackPlayer.add(originalQueue);
        if (currentTrackIndex >= 0) {
          await TrackPlayer.skip(currentTrackIndex);
          if (Number.isFinite(currentPosition) && currentPosition > 0) {
            await TrackPlayer.seekTo(currentPosition);
          }
          if (wasPlaying) {
            await TrackPlayer.play();
          }
        }
        shuffleBackupRef.current = null;
        setQueue(originalQueue);
        shuffleEnabledRef.current = false;
        setShuffleEnabled(false);
      }
    } catch (error) {
      console.error('Failed to toggle shuffle', error);
    } finally {
      shuffleToggleInProgressRef.current = false;
    }
  }, [track, canShuffle, position, isPlaying, queue, shuffleArray]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 12,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 80) {
            navigation.goBack();
          }
        },
      }),
    [navigation],
  );

  const handleAddToPlaylist = async (playlistId: number) => {
    if (!track) {
      return;
    }
    try {
      await addTrackToPlaylist(playlistId, Number(track.id));
      Alert.alert('Added', 'Track added to playlist.');
      const playlistMeta = playlists.find(item => item.id === playlistId);
      autoDownloadNewTrack(playlistMeta, trackToSong(track));
      setActionsVisible(false);
      setPlaylistPickerVisible(false);
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to add to playlist');
    }
  };


  const handleProgressGesture = useCallback(
    (event: GestureResponderEvent) => {
      if (!duration || progressBarWidth <= 0) {
        return;
      }
      const { locationX } = event.nativeEvent;
      const fraction = Math.min(Math.max(locationX / progressBarWidth, 0), 1);
      TrackPlayer.seekTo(duration * fraction);
    },
    [duration, progressBarWidth],
  );

  const content = (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Icon name="chevron-down" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('nowPlaying.title')}</Text>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setActionsVisible(true)}>
          <Icon name="more-vertical" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.artworkContainer}>
          <Animated.View style={[styles.artworkWrapper, styles.artworkGlowBase, { shadowColor: primary }, artworkAnimatedStyle]}>
            {/* Show artwork only when lyrics are hidden */}
            {!lyricsVisible && (
              track ? (
                <ArtworkImage
                  uri={track.artwork ?? undefined}
                  size={300}
                  fallbackLabel={track.title?.[0]?.toUpperCase()}
                />
              ) : (
                <View style={styles.placeholderArtwork}>
                  <Icon name="music" size={64} color="#8aa4ff" />
                </View>
              )
            )}
            {/* Lyrics view - replaces artwork completely with smooth transition */}
            {lyricsVisible && (
              <Animated.View 
                style={[
                  styles.lyricsOverlay,
                  {
                    transform: [{
                      translateY: lyricTransitionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 20],
                      }),
                    }],
                    opacity: lyricTransitionAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [1, 0.7, 0.5],
                    }),
                  },
                ]}
              >
                {lyricsLoading ? (
                  <Text style={styles.lyricsStatusText}>Loading...</Text>
                ) : lyricsError ? (
                  <Text style={styles.lyricsStatusText}>No lyrics found</Text>
                ) : syncedLyrics.length > 0 ? (
                  <>
                    {/* Previous line -2 */}
                    {currentLyricIndex > 1 && syncedLyrics[currentLyricIndex - 2] && (
                      <Text style={styles.lyricLineFar} numberOfLines={1}>
                        {syncedLyrics[currentLyricIndex - 2].text}
                      </Text>
                    )}
                    {/* Previous line -1 */}
                    {currentLyricIndex > 0 && syncedLyrics[currentLyricIndex - 1] && (
                      <Text style={styles.lyricLinePrev} numberOfLines={1}>
                        {syncedLyrics[currentLyricIndex - 1].text}
                      </Text>
                    )}
                    {/* Current line */}
                    {currentLyricIndex >= 0 && syncedLyrics[currentLyricIndex] && (
                      <Text style={styles.lyricLineCurrent} numberOfLines={2}>
                        {syncedLyrics[currentLyricIndex].text}
                      </Text>
                    )}
                    {/* Next line +1 */}
                    {currentLyricIndex >= 0 && syncedLyrics[currentLyricIndex + 1] && (
                      <Text style={styles.lyricLineNext} numberOfLines={1}>
                        {syncedLyrics[currentLyricIndex + 1].text}
                      </Text>
                    )}
                    {/* Next line +2 */}
                    {currentLyricIndex >= 0 && syncedLyrics[currentLyricIndex + 2] && (
                      <Text style={styles.lyricLineFar} numberOfLines={1}>
                        {syncedLyrics[currentLyricIndex + 2].text}
                      </Text>
                    )}
                  </>
                ) : plainLyrics.length > 0 ? (
                  <Text style={styles.lyricLineCurrent}>{plainLyrics[0]}</Text>
                ) : (
                  <Text style={styles.lyricsStatusText}>No lyrics</Text>
                )}
              </Animated.View>
            )}
          </Animated.View>
        </View>

        <View style={styles.trackInfo}>
          <View style={styles.trackTitleRow}>
            <Text style={styles.trackTitle} numberOfLines={2}>{track?.title ?? t('nowPlaying.placeholderTitle')}</Text>
            {/* Lyrics toggle button - next to song title */}
            <TouchableOpacity
              style={[styles.lyricsButton, lyricsVisible && styles.lyricsButtonActive]}
              onPress={handleLyricsToggle}
            >
              <Icon name="quote" size={16} color={lyricsVisible ? primary : 'rgba(255,255,255,0.6)'} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleArtistPress} disabled={!track?.artist}>
            <Text style={[styles.trackArtist, track?.artist && styles.trackArtistTappable]}>
              {track?.artist ?? t('nowPlaying.placeholderArtist')}
            </Text>
          </TouchableOpacity>
          {track?.album ? <Text style={styles.trackAlbum}>{track.album}</Text> : null}
        </View>

        <View style={styles.progressSection}>
          <View
            style={styles.progressBar}
            onLayout={event => setProgressBarWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleProgressGesture}
            onResponderMove={handleProgressGesture}
            onResponderRelease={handleProgressGesture}
          >
            <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: primary }]} />
          </View>
          <View style={styles.progressTimes}>
            <Text style={styles.progressTime}>{formatTime(position)}</Text>
            <Text style={styles.progressTime}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={handleRepeatToggle}>
            <Icon
              name={repeatMode === RepeatMode.Track ? 'repeat' : 'repeat'}
              size={20}
              color={repeatMode === RepeatMode.Off ? '#6b7280' : primary}
            />
            {repeatMode === RepeatMode.Track ? (
              <View style={[styles.repeatBadge, { backgroundColor: primary }]}>
                <Text style={[styles.repeatBadgeText, { color: onPrimary }]}>1</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={handleSkipPrev}>
            <Icon name="skip-back" size={28} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.playBtn, { backgroundColor: primary, shadowColor: primary }]} onPress={() => togglePlayback()}>
            {track ? (
              <Icon name={isPlaying ? 'pause' : 'play'} size={28} color={onPrimary} />
            ) : (
              <ActivityIndicator color={onPrimary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={handleSkipNext}>
            <Icon name="skip-forward" size={28} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.controlBtn,
              !canShuffle && styles.disabledControl,
              shuffleEnabled && [styles.shuffleActive, { borderColor: primary }],
            ]}
            onPress={handleShuffleToggle}
            disabled={!canShuffle}
          >
            <Icon name="shuffle" size={20} color={shuffleEnabled ? primary : '#ffffff'} />
          </TouchableOpacity>
        </View>

        <View style={styles.queueSection}>
          <Text style={styles.queueTitle}>{t('nowPlaying.upNext')}</Text>
          {queue.length === 0 ? (
            <Text style={styles.emptyQueue}>{t('nowPlaying.queueEmpty')}</Text>
          ) : (
            queue.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <TouchableOpacity
                  key={`${item.id}-${index}`}
                  style={styles.queueItem}
                  onPress={() => handleSelectTrack(item)}
                  disabled={isActive}
                >
                  <View style={[styles.queueArtwork, isActive && [styles.queueArtworkActive, { borderColor: primary }]]}>
                    <ArtworkImage
                      uri={typeof item.artwork === 'string' ? item.artwork : null}
                      size={42}
                      fallbackLabel={item.title?.[0]?.toUpperCase()}
                    />
                  </View>
                  <View style={styles.queueInfo}>
                    <Text
                      style={[styles.queueSongTitle, isActive && [{ color: primary }, styles.queueSongTitleActive]]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.queueSongArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  {isActive ? <Text style={[styles.queueNow, { color: primary, borderColor: primary }]}>NOW</Text> : null}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={actionsVisible}
        animationType="fade"
        onRequestClose={() => setActionsVisible(false)}
      >
        <View style={styles.centeredModalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setActionsVisible(false)} />
          <View style={styles.centeredModalContainer}>
            <Text style={styles.sheetTitle}>{track?.title ?? t('playlist.optionsTitle')}</Text>
            <View style={styles.sheetSection}>
              <TouchableOpacity
                style={styles.sheetAction}
                onPress={() => {
                  if (playlists.length === 0 && !loadingPlaylists) {
                    loadPlaylists();
                  }
                  setActionsVisible(false);
                  setPlaylistPickerVisible(true);
                }}
              >
                <Icon name="plus-circle" size={18} color="#ffffff" />
                <Text style={styles.sheetActionText}>{t('common.addToPlaylist')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.sheetAction} onPress={() => setActionsVisible(false)}>
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
        <View style={styles.centeredModalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPlaylistPickerVisible(false)} />
          <View style={styles.centeredModalContainer}>
            <Text style={styles.sheetTitle}>{t('playlist.choosePlaylist')}</Text>
            {loadingPlaylists ? (
              <ActivityIndicator color={primary} />
            ) : playlists.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('playlist.noOtherPlaylists')}</Text>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={item => `${item.id}`}
                style={styles.playlistList}
                contentContainerStyle={styles.playlistListContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.sheetAction}
                    onPress={() => handleAddToPlaylist(item.id)}
                  >
                    <Icon name="folder-plus" size={18} color="#ffffff" />
                    <Text style={styles.sheetActionText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.sheetAction} onPress={() => setPlaylistPickerVisible(false)}>
              <Icon name="x" size={18} color="#f87171" />
              <Text style={[styles.sheetActionText, styles.sheetDangerText]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );

  if (backgroundSource) {
    return (
      <ImageBackground source={backgroundSource} blurRadius={15} style={styles.backgroundImage}>
        <View style={styles.backdropOverlay} />
        {content}
      </ImageBackground>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#121212',
  },
  menuBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#121212',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  spacer: {
    width: 40,
  },
  content: {
    padding: 24,
    gap: 32,
    paddingBottom: 120,
  },
  artworkContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  artworkWrapper: {
    width: 320,
    height: 320,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    // No overflow:hidden - allows shadow/glow to show
  },
  lyricsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  lyricsButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  // Lyrics view - replaces artwork, no background
  lyricsOverlay: {
    width: 300,
    height: 300,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    overflow: 'hidden',
  },
  lyricLineFar: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    fontWeight: '400',
    lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lyricLinePrev: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lyricLineCurrent: {
    fontSize: 19,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 27,
    marginVertical: 6,
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  lyricLineNext: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lyricsStatusText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  artworkGlowBase: {
    shadowOpacity: 0.6,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
  },
  placeholderArtwork: {
    width: 300,
    height: 300,
    borderRadius: 24,
    backgroundColor: '#1b1b1b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: {
    alignItems: 'center',
    gap: 6,
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    flexShrink: 1,
  },
  trackArtist: {
    fontSize: 16,
    color: '#9090a5',
  },
  trackArtistTappable: {
    opacity: 0.8,
  },
  trackAlbum: {
    fontSize: 14,
    color: '#7a7a8c',
  },
  progressSection: {
    gap: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1b1b1b',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTime: {
    fontSize: 12,
    color: '#9090a5',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  controlBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#111111',
  },
  disabledControl: {
    opacity: 0.5,
  },
  shuffleActive: {
    borderWidth: 1,
  },
  playBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  repeatBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  queueSection: {
    gap: 12,
  },
  queueTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1b1b1b',
  },
  queueArtwork: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
  },
  queueArtworkActive: {
    borderWidth: 2,
  },
  queueInfo: {
    flex: 1,
  },
  queueSongTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  queueSongTitleActive: {
    fontWeight: '700',
  },
  queueSongArtist: {
    color: '#9090a5',
    fontSize: 12,
  },
  queueNow: {
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  emptyQueue: {
    color: '#6b7280',
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
    backgroundColor: '#0d0d0d',
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
    color: '#6b7280',
    fontSize: 14,
  },
  playlistList: {
    maxHeight: 240,
  },
  playlistListContent: {
    gap: 8,
  },
  centeredModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centeredModalContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    backgroundColor: '#0d0d0d',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
});

export default NowPlayingScreen;
