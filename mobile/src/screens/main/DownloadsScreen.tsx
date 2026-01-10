import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchDownloads, requestSpotifyPlaylistImport, requestUrlDownload } from '../../api/service';
import { useOffline } from '../../context/OfflineContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { hexToRgba } from '../../utils/color';
import type { DownloadItem } from '../../types/models';

type ImportType = 'track' | 'playlist';

const IMPORT_OPTIONS: Array<{
  type: ImportType;
  title: string;
  description: string;
  icon: string;
  accent: string;
}> = [
  {
    type: 'track',
    title: 'Spotify Track',
    description: 'Single song URL',
    icon: 'music',
    accent: '#1db954',
  },
  {
    type: 'playlist',
    title: 'Spotify Playlist',
    description: 'Full playlist URL',
    icon: 'list',
    accent: '#34d399',
  },
];

const DownloadsScreen: React.FC = () => {
  const { primary, onPrimary } = useAccentColor();
  const { state: offlineState } = useOffline();
  const insets = useSafeAreaInsets();
  const [importVisible, setImportVisible] = useState(false);
  const [importType, setImportType] = useState<ImportType>('track');
  const [importUrl, setImportUrl] = useState('');
  const [submittingImport, setSubmittingImport] = useState(false);

  const {
    data = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['downloads'],
    queryFn: fetchDownloads,
    refetchInterval: 5000,
  });

  const importMeta = useMemo(
    () =>
      importType === 'track'
        ? {
            label: 'Spotify track URL',
            placeholder: 'https://open.spotify.com/track/…',
            hint: 'Example: https://open.spotify.com/track/abc123',
            cta: 'Download track',
          }
        : {
            label: 'Spotify playlist URL',
            placeholder: 'https://open.spotify.com/playlist/…',
            hint: 'Example: https://open.spotify.com/playlist/xyz789',
            cta: 'Import playlist',
          },
    [importType],
  );

  const handleImportOpen = () => {
    setImportUrl('');
    setImportType('track');
    setImportVisible(true);
  };

  const handleImportClose = () => {
    if (!submittingImport) {
      setImportVisible(false);
    }
  };

  const handleStartImport = async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl) {
      Alert.alert('Missing URL', 'Paste a Spotify link to continue.');
      return;
    }
    const isTrack = /spotify\.com\/track\//i.test(trimmedUrl);
    const isPlaylist = /spotify\.com\/playlist\//i.test(trimmedUrl);
    if ((importType === 'track' && !isTrack) || (importType === 'playlist' && !isPlaylist)) {
      Alert.alert(
        'Invalid link',
        importType === 'track'
          ? 'Enter a valid Spotify track URL.'
          : 'Enter a valid Spotify playlist URL.',
      );
      return;
    }

    setSubmittingImport(true);
    try {
      if (importType === 'track') {
        await requestUrlDownload(trimmedUrl);
      } else {
        await requestSpotifyPlaylistImport(trimmedUrl);
      }
      Alert.alert(
        'Import requested',
        importType === 'track'
          ? 'Track download has been queued.'
          : 'Playlist import has been queued.',
      );
      setImportVisible(false);
      setImportUrl('');
      refetch();
    } catch (err) {
      Alert.alert('Failed to import', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmittingImport(false);
    }
  };

  if (isLoading && data.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#ffffff" />
        <Text style={styles.loadingText}>Checking downloads…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Unable to load downloads'}
        </Text>
      </View>
    );
  }

  const offlineProgressEntries = Object.entries(offlineState.downloadProgress);
  const statusMessage = offlineState.statusMessage;
  const progressBlock =
    offlineProgressEntries.length || statusMessage ? (
      <View style={styles.offlineHeader}>
        {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
        {offlineProgressEntries.map(([playlistId, progress]) => {
          const playlist = offlineState.playlists[Number(playlistId)];
          return (
            <View key={playlistId} style={styles.offlineProgressRow}>
              <View style={styles.offlineProgressText}>
                <Text style={styles.offlineTitle}>
                  {playlist?.playlist.name || `Playlist ${playlistId}`}
                </Text>
                <Text style={styles.offlineSubtitle}>
                  {Math.round((progress ?? 0) * 100)}% downloaded
                </Text>
              </View>
              <View style={styles.offlineProgressBarContainer}>
                <View
                  style={[
                    styles.offlineProgressBar,
                    { width: `${Math.round((progress ?? 0) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    ) : null;

  const headerComponent = (
    <View style={styles.listHeader}>
      <View style={[styles.pageHeader, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.pageTitle}>Downloads</Text>
          <Text style={styles.pageSubtitle}>Track progress or import Spotify links</Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: primary, shadowColor: primary }]}
          onPress={handleImportOpen}
          accessibilityRole="button"
          accessibilityLabel="Import music"
        >
          <Icon name="plus" size={18} color={onPrimary} />
        </TouchableOpacity>
      </View>
      {progressBlock}
    </View>
  );

  return (
    <>
      <FlatList
        data={data}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.helperText}>No downloads yet.</Text>
            <Text style={styles.helperSubtext}>Tap + to import a Spotify link.</Text>
          </View>
        }
        renderItem={({ item }) => <DownloadRow item={item} />}
      />
      <Modal
        transparent
        visible={importVisible}
        animationType="fade"
        onRequestClose={handleImportClose}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleImportClose} />
        <View style={[styles.importSheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.sheetTitle}>Import Music</Text>
          <Text style={styles.sheetSubtitle}>Pull tracks straight from Spotify</Text>
          <View style={styles.importOptions}>
            {IMPORT_OPTIONS.map(option => {
              const isActive = option.type === importType;
              const accentColor = option.type === 'track' ? primary : option.accent;
              return (
                <TouchableOpacity
                  key={option.type}
                  style={[
                    styles.importOption,
                    isActive && [
                      styles.importOptionActive,
                      {
                        borderColor: hexToRgba(accentColor, 0.5),
                        backgroundColor: hexToRgba(accentColor, 0.12),
                      },
                    ],
                  ]}
                  onPress={() => setImportType(option.type)}
                >
                  <View
                    style={[
                      styles.importIcon,
                      {
                        backgroundColor: hexToRgba(accentColor, 0.12),
                        borderColor: hexToRgba(accentColor, 0.4),
                      },
                    ]}
                  >
                    <Icon name={option.icon} size={18} color={accentColor} />
                  </View>
                  <View style={styles.importTextBlock}>
                    <Text style={styles.importOptionTitle}>{option.title}</Text>
                    <Text style={styles.importOptionDescription}>{option.description}</Text>
                  </View>
                  {isActive ? <Icon name="check" size={16} color={accentColor} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{importMeta.label}</Text>
            <TextInput
              style={styles.input}
              value={importUrl}
              onChangeText={setImportUrl}
              placeholder={importMeta.placeholder}
              placeholderTextColor="#5c5c6b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!submittingImport}
            />
            <Text style={styles.inputHint}>{importMeta.hint}</Text>
          </View>
          <View style={styles.importActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleImportClose}
              disabled={submittingImport}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
              styles.primaryBtn,
              { backgroundColor: primary, shadowColor: primary },
              submittingImport && styles.primaryBtnDisabled,
            ]}
              onPress={handleStartImport}
              disabled={submittingImport}
            >
              {submittingImport ? (
                <ActivityIndicator color={onPrimary} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: onPrimary }]}>{importMeta.cta}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const statusColorMap: Record<DownloadItem['status'], string> = {
  searching: '#8aa4ff',
  downloading: '#8aa4ff',
  completed: '#4ade80',
  failed: '#f87171',
  cancelled: '#facc15',
  canceled: '#facc15',
  unknown: '#9090a5',
};

const DownloadRow = ({ item }: { item: DownloadItem }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{item.title}</Text>
        {item.status === 'completed' ? (
          <Icon name="check-circle" size={16} color="#4ade80" />
        ) : null}
      </View>
      <Text style={styles.subtitle}>{item.artist}</Text>
      {item.album ? <Text style={styles.album}>{item.album}</Text> : null}
    </View>
    <View style={[styles.statusChip, { backgroundColor: statusColorMap[item.status] ?? '#9090a5' }]}>
      <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  listContent: {
    paddingBottom: 80,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  pageTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  pageSubtitle: {
    color: '#7c7c8a',
    marginTop: 4,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  offlineHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  statusMessage: {
    color: '#8aa4ff',
    fontWeight: '600',
  },
  offlineProgressRow: {
    gap: 8,
  },
  offlineProgressText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offlineTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  offlineSubtitle: {
    color: '#9090a5',
    fontSize: 12,
  },
  offlineProgressBarContainer: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#282828',
    overflow: 'hidden',
  },
  offlineProgressBar: {
    height: '100%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 24,
  },
  loadingText: {
    color: '#e6e6f2',
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
  },
  helperText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  helperSubtext: {
    color: '#9090a5',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e2c',
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#9090a5',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  album: {
    color: '#606072',
    fontSize: 12,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  importSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#050509',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 20,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color: '#8b8ba0',
  },
  importOptions: {
    gap: 12,
  },
  importOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  importOptionActive: {
    borderWidth: 1,
  },
  importIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  importTextBlock: {
    flex: 1,
  },
  importOptionTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  importOptionDescription: {
    color: '#8b8ba0',
    fontSize: 12,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#d1d1de',
    fontWeight: '600',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 14,
    backgroundColor: '#0f0f17',
    borderWidth: 1,
    borderColor: '#1b1b27',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
  },
  inputHint: {
    color: '#6c6c80',
    fontSize: 12,
  },
  importActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#272738',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: '#d1d1de',
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default DownloadsScreen;
