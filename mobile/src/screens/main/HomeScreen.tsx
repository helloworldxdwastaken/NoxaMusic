import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  fetchGeneratedPlaylists,
  fetchPlaylists,
  fetchSongs,
  addTrackToPlaylist,
} from '../../api/service';
import type { Playlist, Song } from '../../types/models';
import ArtworkImage from '../../components/ArtworkImage';
import { playSong } from '../../services/player/PlayerService';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppStackParamList, AppTabsParamList } from '../../navigation/types';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useLanguage } from '../../context/LanguageContext';
import { useAutoDownloadNewTracks } from '../../hooks/useAutoDownloadNewTracks';
import { useAccentColor } from '../../hooks/useAccentColor';
import LinearGradient from 'react-native-linear-gradient';

const TRACK_SEPARATOR_STYLE = { height: 16 };
const TRACK_FOOTER_STYLE = { height: 8 };

const TrackGridSeparator = () => <View style={TRACK_SEPARATOR_STYLE} />;
const TrackGridFooter = () => <View style={TRACK_FOOTER_STYLE} />;

type HomeTabNav = BottomTabNavigationProp<AppTabsParamList, 'Home'>;
type RootStackNav = NativeStackNavigationProp<AppStackParamList>;
type NavigationProp = CompositeNavigationProp<HomeTabNav, RootStackNav>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const connectivity = useConnectivity();
  const { t } = useLanguage();
  const autoDownloadNewTrack = useAutoDownloadNewTracks();
  const { primary, primaryRgba } = useAccentColor();

  const {
    data: playlists = [],
    isLoading: playlistsLoading,
    refetch: refetchPlaylists,
  } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes cache
  });

  const {
    data: generatedPlaylists = [],
    isLoading: generatedLoading,
    refetch: refetchGenerated,
  } = useQuery({
    queryKey: ['playlists', 'generated'],
    queryFn: fetchGeneratedPlaylists,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes cache
  });

  const {
    data: recentTracks = [],
    isLoading: tracksLoading,
    refetch: refetchTracks,
  } = useQuery({
    queryKey: ['library', 'recent'],
    queryFn: () => fetchSongs({ limit: 10 }),
  });

  const isRefreshing = playlistsLoading || tracksLoading || generatedLoading;

  const currentHour = new Date().getHours();
  let greetingKey: 'morning' | 'afternoon' | 'evening' | 'night' = 'night';
  if (currentHour >= 5 && currentHour < 12) {
    greetingKey = 'morning';
  } else if (currentHour >= 12 && currentHour < 18) {
    greetingKey = 'afternoon';
  } else if (currentHour >= 18 && currentHour < 22) {
    greetingKey = 'evening';
  }
  const greetingText = t(`home.greetings.${greetingKey}`);
  const greetingLabel =
    greetingText === `home.greetings.${greetingKey}` ? t('home.greeting') : greetingText;

  const handleRefresh = () => {
    refetchPlaylists();
    refetchGenerated();
    refetchTracks();
  };

  const [trackMenuVisible, setTrackMenuVisible] = useState(false);
  const [playlistPickerVisible, setPlaylistPickerVisible] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Song | null>(null);
  const [addingPlaylistId, setAddingPlaylistId] = useState<number | null>(null);
  const [madeForYouScroll, setMadeForYouScroll] = useState(0);
  const [playlistsScroll, setPlaylistsScroll] = useState(0);


  const handlePlayTrack = useCallback(
    (song: Song) => {
      const queue = recentTracks.filter(track => track.id !== song.id);
      playSong(song, queue).catch(error => console.error('Failed to start playback', error));
    },
    [recentTracks],
  );

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const renderPlaylistItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={styles.playlistCard}
      onPress={() => {
        navigation.navigate('Library', {
          screen: 'PlaylistDetail',
          params: {
            playlistId: item.id,
            playlistName: item.name,
            description: item.description,
            coverUrl: item.coverUrl ?? undefined,
            trackCount: item.trackCount,
          },
        });
      }}
    >
      <View style={styles.playlistArtwork}>
        <ArtworkImage
          uri={item.coverUrl}
          size={160}
          fallbackLabel={item.name?.[0]?.toUpperCase()}
        />
      </View>
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.4, 0.7, 1]}
        style={styles.playlistGradient}
      >
        <View style={styles.playlistTextContainer}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.playlistTrackCount}>{item.trackCount} tracks</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  // Render function for generated playlists with image caching
  const renderCachedPlaylistItem = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={styles.playlistCard}
      onPress={() => {
        navigation.navigate('Library', {
          screen: 'PlaylistDetail',
          params: {
            playlistId: item.id,
            playlistName: item.name,
            description: item.description,
            coverUrl: item.coverUrl ?? undefined,
            trackCount: item.trackCount,
          },
        });
      }}
    >
      <View style={styles.playlistArtwork}>
        <ArtworkImage
          uri={item.coverUrl}
          size={160}
          fallbackLabel={item.name?.[0]?.toUpperCase()}
        />
      </View>
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.4, 0.7, 1]}
        style={styles.playlistGradient}
      >
        <View style={styles.playlistTextContainer}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.playlistTrackCount}>{item.trackCount} tracks</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const handleOpenTrackMenu = (track: Song) => {
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
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('common.unableToAddTrack'),
      );
    } finally {
      setAddingPlaylistId(null);
      setPlaylistPickerVisible(false);
      setSelectedTrack(null);
    }
  };


  const renderRecentTrack = ({ item }: { item: Song }) => (
    <TouchableOpacity style={styles.trackCard} onPress={() => handlePlayTrack(item)}>
      <TouchableOpacity
        style={styles.trackMenuButton}
        onPress={() => handleOpenTrackMenu(item)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Icon name="more-vertical" size={18} color="#ffffff" />
      </TouchableOpacity>
      <View style={styles.trackArtworkWrapper}>
        <ArtworkImage
          uri={item.albumCover}
          size={88}
          fallbackLabel={item.title?.[0]?.toUpperCase()}
        />
      </View>
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const gradientHeight = Math.max(insets.top + 180, 220);

  return (
    <View style={styles.screen}>
      <LinearGradient
        pointerEvents="none"
        colors={[primaryRgba(0.24), primaryRgba(0.1), 'transparent']}
        style={[styles.headerGradient, { height: gradientHeight }]}
      />
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 12 }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#ffffff" />
        }
      >
        {/* Greeting Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.greeting}>{greetingLabel}</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={handleOpenSettings}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.Settings')}
            >
              <Icon name="settings" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
          {connectivity.isOffline ? (
            <View style={styles.offlineBanner}>
              <Icon name="wifi-off" size={16} color="#fcd34d" />
              <Text style={styles.offlineText}>{t('home.offline')}</Text>
            </View>
          ) : null}
        </View>

        {/* Daily Mix & Recommended Horizontal Section */}
        {generatedLoading && generatedPlaylists.length === 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredScrollContainer}
          >
            {/* Skeleton loaders */}
            <View style={[styles.dailyMixBanner, styles.skeletonBanner]}>
              <View style={styles.skeletonGradient} />
            </View>
            <View style={[styles.dailyMixBanner, styles.skeletonBanner]}>
              <View style={styles.skeletonGradient} />
            </View>
          </ScrollView>
        ) : generatedPlaylists.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredScrollContainer}
          >
            {/* Daily Mix Banner */}
            {generatedPlaylists[0] && (
              <TouchableOpacity
                style={styles.dailyMixBanner}
                onPress={() => {
                  const dailyMix = generatedPlaylists[0];
                  navigation.navigate('Library', {
                    screen: 'PlaylistDetail',
                    params: {
                      playlistId: dailyMix.id,
                      playlistName: dailyMix.name,
                      description: dailyMix.description,
                      coverUrl: dailyMix.coverUrl ?? undefined,
                      trackCount: dailyMix.trackCount,
                    },
                  });
                }}
              >
                <View style={styles.dailyMixArtworkContainer}>
                  <ArtworkImage
                    uri={generatedPlaylists[0].coverUrl}
                    size={500}
                    fallbackLabel={generatedPlaylists[0].name?.[0]?.toUpperCase()}
                  />
                </View>
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                  locations={[0, 0.5, 1]}
                  style={styles.dailyMixGradient}
                >
                  <View style={styles.dailyMixContent}>
                    <Text style={styles.dailyMixLabel}>Featured Playlist</Text>
                    <Text style={styles.dailyMixTitle}>{generatedPlaylists[0].name}</Text>
                    <Text style={styles.dailyMixSubtitle}>
                      {generatedPlaylists[0].trackCount} tracks
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Recommended For You Banner */}
            {generatedPlaylists[1] && (
              <TouchableOpacity
                style={styles.dailyMixBanner}
                onPress={() => {
                  const recommended = generatedPlaylists[1];
                  navigation.navigate('Library', {
                    screen: 'PlaylistDetail',
                    params: {
                      playlistId: recommended.id,
                      playlistName: recommended.name,
                      description: recommended.description,
                      coverUrl: recommended.coverUrl ?? undefined,
                      trackCount: recommended.trackCount,
                    },
                  });
                }}
              >
                <View style={styles.dailyMixArtworkContainer}>
                  <ArtworkImage
                    uri={generatedPlaylists[1].coverUrl}
                    size={500}
                    fallbackLabel={generatedPlaylists[1].name?.[0]?.toUpperCase()}
                  />
                </View>
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                  locations={[0, 0.5, 1]}
                  style={styles.dailyMixGradient}
                >
                  <View style={styles.dailyMixContent}>
                    <Text style={styles.dailyMixLabel}>Recommended For You</Text>
                    <Text style={styles.dailyMixTitle}>{generatedPlaylists[1].name}</Text>
                    <Text style={styles.dailyMixSubtitle}>
                      {generatedPlaylists[1].trackCount} tracks
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : null}

        {/* Made For You Section */}
        {generatedLoading && generatedPlaylists.length === 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.skeletonText, styles.skeletonTitle]} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {[1, 2, 3].map(i => (
                <View key={i} style={[styles.playlistCard, styles.skeletonCard]}>
                  <View style={styles.skeletonArtwork} />
                  <View style={[styles.skeletonText, styles.skeletonCardTitle]} />
                  <View style={[styles.skeletonText, styles.skeletonCardSubtitle]} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : generatedPlaylists.length > 2 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.madeForYou') ?? 'Made For You'}</Text>
            </View>
            <FlatList
              horizontal
              data={generatedPlaylists.slice(2)}
              renderItem={renderCachedPlaylistItem}
              keyExtractor={item => `gen-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              onScroll={e => {
                const scrollPosition = e.nativeEvent.contentOffset.x;
                const contentWidth = e.nativeEvent.contentSize.width;
                const layoutWidth = e.nativeEvent.layoutMeasurement.width;
                const maxScroll = contentWidth - layoutWidth;
                const scrollPercentage = maxScroll > 0 ? scrollPosition / maxScroll : 0;
                setMadeForYouScroll(scrollPercentage);
              }}
              scrollEventThrottle={16}
            />
            {generatedPlaylists.length > 3 && (
              <View style={styles.scrollIndicatorContainer}>
                <View style={styles.scrollIndicatorTrack}>
                  <View
                    style={[
                      styles.scrollIndicatorThumb,
                      {
                        backgroundColor: primary,
                        left: `${madeForYouScroll * 70}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}

        {/* Your Playlists Section */}
        {playlistsLoading && playlists.length === 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.skeletonText, styles.skeletonPlaylistsTitle]} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {[1, 2, 3].map(i => (
                <View key={i} style={[styles.playlistCard, styles.skeletonCard]}>
                  <View style={styles.skeletonArtwork} />
                  <View style={[styles.skeletonText, styles.skeletonCardTitle]} />
                  <View style={[styles.skeletonText, styles.skeletonCardSubtitle]} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : playlists.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.playlists')}</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('Library', {
                    screen: 'LibraryMain',
                    params: { view: 'playlists' },
                  })
                }
              >
                <Text style={styles.showAll}>{t('home.showAll')}</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={playlists.slice(0, 5)}
              renderItem={renderPlaylistItem}
              keyExtractor={item => `${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              onScroll={e => {
                const scrollPosition = e.nativeEvent.contentOffset.x;
                const contentWidth = e.nativeEvent.contentSize.width;
                const layoutWidth = e.nativeEvent.layoutMeasurement.width;
                const maxScroll = contentWidth - layoutWidth;
                const scrollPercentage = maxScroll > 0 ? scrollPosition / maxScroll : 0;
                setPlaylistsScroll(scrollPercentage);
              }}
              scrollEventThrottle={16}
            />
            {playlists.length > 1 && (
              <View style={styles.scrollIndicatorContainer}>
                <View style={styles.scrollIndicatorTrack}>
                  <View
                    style={[
                      styles.scrollIndicatorThumb,
                      {
                        backgroundColor: primary,
                        left: `${playlistsScroll * 70}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}

        {/* Recently Added */}
        {recentTracks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.recentlyAdded')}</Text>
            </View>
            <FlatList
              data={recentTracks}
              renderItem={renderRecentTrack}
              keyExtractor={item => `${item.id}`}
              numColumns={2}
              columnWrapperStyle={styles.trackColumn}
              scrollEnabled={false}
              ItemSeparatorComponent={TrackGridSeparator}
              ListFooterComponent={TrackGridFooter}
              contentContainerStyle={styles.trackGrid}
            />
          </View>
        )}

        {/* Empty State for New Users */}
        {!playlistsLoading && !tracksLoading && !generatedLoading &&
          playlists.length === 0 && recentTracks.length === 0 && generatedPlaylists.length === 0 && (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIcon}>
              <Icon name="music" size={48} color="#9090a5" />
            </View>
            <Text style={styles.emptyStateTitle}>{t('home.emptyTitle') ?? 'Welcome to Your Music'}</Text>
            <Text style={styles.emptyStateSubtitle}>
              {t('home.emptySubtitle') ?? 'Start building your library by creating a playlist or adding music'}
            </Text>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: primary }]}
              onPress={() => navigation.navigate('Create')}
            >
              <Icon name="plus" size={18} color="#ffffff" />
              <Text style={styles.emptyStateButtonText}>{t('home.createPlaylist') ?? 'Create Playlist'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Show Made For You even when library is empty */}
        {!generatedLoading && generatedPlaylists.length > 0 &&
          playlists.length === 0 && recentTracks.length === 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.madeForYou') ?? 'Made For You'}</Text>
            </View>
            <FlatList
              horizontal
              data={generatedPlaylists}
              renderItem={renderCachedPlaylistItem}
              keyExtractor={item => `gen-empty-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {playlistsLoading || tracksLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#ffffff" />
          </View>
        ) : null}

        <Modal
          visible={trackMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={closeTrackMenu}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeTrackMenu} />
            <View style={styles.dialogCard}>
              <Text style={styles.sheetTitle}>
                {selectedTrack?.title ?? t('common.trackActions')}
              </Text>
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
          visible={playlistPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPlaylistPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPlaylistPickerVisible(false)}
            />
            <View style={[styles.dialogCard, styles.playlistDialog]}>
              <Text style={styles.sheetTitle}>{t('playlist.choosePlaylist')}</Text>
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  offlineBanner: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineText: {
    color: '#fcd34d',
    fontWeight: '600',
    fontSize: 13,
  },
  featuredScrollContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  dailyMixBanner: {
    width: 320,
    height: 160,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  dailyMixArtworkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyMixGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  dailyMixContent: {
    padding: 16,
    gap: 4,
  },
  dailyMixLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dailyMixTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  dailyMixSubtitle: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: '500',
  },
  section: {
    marginTop: 32,
    paddingBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  showAll: {
    fontSize: 14,
    color: '#9090a5',
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: 24,
  },
  playlistCard: {
    width: 160,
    height: 160,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    marginRight: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  playlistArtwork: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 160,
    height: 160,
  },
  playlistGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  playlistTextContainer: {
    padding: 12,
    gap: 4,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  playlistTrackCount: {
    fontSize: 12,
    color: '#e0e0e0',
  },
  trackGrid: {
    paddingHorizontal: 24,
    gap: 16,
  },
  trackColumn: {
    gap: 16,
  },
  trackCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    gap: 12,
    alignItems: 'center',
    position: 'relative',
  },
  trackMenuButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  trackArtworkWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  trackInfo: {
    gap: 4,
    alignItems: 'center',
    width: '100%',
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  trackArtist: {
    fontSize: 12,
    color: '#9090a5',
    textAlign: 'center',
  },
  centered: {
    padding: 32,
    alignItems: 'center',
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
    maxHeight: '75%',
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
  scrollIndicatorContainer: {
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
  scrollIndicatorTrack: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    position: 'relative',
  },
  scrollIndicatorThumb: {
    position: 'absolute',
    width: 24,
    height: 4,
    borderRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  // Skeleton loader styles
  skeletonBanner: {
    backgroundColor: '#1a1a1a',
  },
  skeletonGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
    opacity: 0.3,
  },
  skeletonCard: {
    backgroundColor: '#1a1a1a',
  },
  skeletonArtwork: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
  },
  skeletonText: {
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
  },
  skeletonTitle: {
    width: 120,
    height: 20,
  },
  skeletonPlaylistsTitle: {
    width: 100,
    height: 20,
  },
  skeletonCardTitle: {
    width: '80%',
    height: 14,
    marginTop: 8,
  },
  skeletonCardSubtitle: {
    width: '60%',
    height: 12,
    marginTop: 4,
  },
  // Empty state styles
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
    gap: 16,
  },
  emptyStateIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(144, 144, 165, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#9090a5',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default HomeScreen;
