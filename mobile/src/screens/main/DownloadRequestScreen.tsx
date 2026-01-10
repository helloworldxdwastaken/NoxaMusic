import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../../components/Icon';
import { useAccentColor } from '../../hooks/useAccentColor';

import {
  requestDownloadAdd,
  requestSpotifyPlaylistImport,
  requestUrlDownload,
} from '../../api/service';
import type { AppStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'DownloadRequest'>;

type DownloadMode = 'manual' | 'spotify' | 'playlist';

const DownloadRequestScreen: React.FC<Props> = ({ navigation }) => {
  const queryClient = useQueryClient();
  const { primary } = useAccentColor();
  const [mode, setMode] = useState<DownloadMode>('manual');

  // Manual download fields
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');

  // Spotify/URL fields
  const [url, setUrl] = useState('');

  // Playlist import fields
  const [playlistUrl, setPlaylistUrl] = useState('');

  // const { data: playlists = [] } = useQuery({
  //   queryKey: ['playlists'],
  //   queryFn: fetchPlaylists,
  // });

  const manualDownloadMutation = useMutation({
    mutationFn: () => requestDownloadAdd(title.trim(), artist.trim(), album.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      Alert.alert('Success', 'Download added to queue');
      setTitle('');
      setArtist('');
      setAlbum('');
    },
    onError: () => Alert.alert('Error', 'Failed to add download'),
  });

  const urlDownloadMutation = useMutation({
    mutationFn: () => requestUrlDownload(url.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      Alert.alert('Success', 'Download started from URL');
      setUrl('');
    },
    onError: () => Alert.alert('Error', 'Failed to download from URL'),
  });

  const playlistImportMutation = useMutation({
    mutationFn: () => requestSpotifyPlaylistImport(playlistUrl.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      Alert.alert('Success', 'Playlist import started');
      setPlaylistUrl('');
    },
    onError: () => Alert.alert('Error', 'Failed to import playlist'),
  });

  const handleSubmit = () => {
    if (mode === 'manual') {
      if (!title.trim() || !artist.trim()) {
        Alert.alert('Missing Info', 'Please enter at least title and artist.');
        return;
      }
      manualDownloadMutation.mutate();
    } else if (mode === 'spotify') {
      if (!url.trim()) {
        Alert.alert('Missing URL', 'Please enter a Spotify or YouTube URL.');
        return;
      }
      urlDownloadMutation.mutate();
    } else if (mode === 'playlist') {
      if (!playlistUrl.trim()) {
        Alert.alert('Missing URL', 'Please enter a Spotify playlist URL.');
        return;
      }
      playlistImportMutation.mutate();
    }
  };

  const isPending =
    manualDownloadMutation.isPending ||
    urlDownloadMutation.isPending ||
    playlistImportMutation.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.overlayContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dialogCard}>
        {/* Header */}
        <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color="#ffffff" />
        </TouchableOpacity>
          <Text style={styles.headerTitle}>Download Music</Text>
        </View>

        {/* Mode Selector */}
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]}
            onPress={() => setMode('manual')}
          >
            <Text style={[styles.modeBtnText, mode === 'manual' && styles.modeBtnTextActive]}>
              ✍️ Manual
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'spotify' && styles.modeBtnActive]}
            onPress={() => setMode('spotify')}
          >
            <Text style={[styles.modeBtnText, mode === 'spotify' && styles.modeBtnTextActive]}>
              🔗 URL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'playlist' && [{ backgroundColor: primary }, styles.modeBtnActive]]}
            onPress={() => setMode('playlist')}
          >
            <Text style={[styles.modeBtnText, mode === 'playlist' && styles.modeBtnTextActive]}>
              📋 Playlist
            </Text>
          </TouchableOpacity>
        </View>

        {/* Manual Download Form */}
        {mode === 'manual' && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>Song Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter song title"
              placeholderTextColor="#606072"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.formLabel}>Artist *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter artist name"
              placeholderTextColor="#606072"
              value={artist}
              onChangeText={setArtist}
            />

            <Text style={styles.formLabel}>Album (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter album name"
              placeholderTextColor="#606072"
              value={album}
              onChangeText={setAlbum}
            />

            <Text style={styles.helpText}>
              We'll search for the best match using spotdl (Spotify/YouTube).
            </Text>
          </View>
        )}

        {/* URL Download Form */}
        {mode === 'spotify' && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>Spotify or YouTube URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/track/..."
              placeholderTextColor="#606072"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.helpText}>
              Paste a Spotify track or YouTube video URL to download.
            </Text>
          </View>
        )}

        {/* Playlist Import Form */}
        {mode === 'playlist' && (
          <View style={styles.form}>
            <Text style={styles.formLabel}>Spotify Playlist URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://open.spotify.com/playlist/..."
              placeholderTextColor="#606072"
              value={playlistUrl}
              onChangeText={setPlaylistUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.helpText}>
              Import all tracks from a Spotify playlist. This may take several minutes.
            </Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isPending}
        >
          <View style={styles.submitContent}>
            <Icon name={isPending ? 'loader' : 'download'} size={18} color="#ffffff" />
            <Text style={styles.submitText}>
              {isPending ? 'Processing…' : 'Start Download'}
            </Text>
          </View>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dialogCard: {
    backgroundColor: '#050505',
    borderRadius: 28,
    padding: 24,
    gap: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#121212',
    alignItems: 'center',
  },
  modeBtnActive: {},
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9090a5',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  form: {
    gap: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#121212',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
  },
  helpText: {
    fontSize: 13,
    color: '#9090a5',
    lineHeight: 18,
  },
  submitBtn: {
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#1a1a1a',
    opacity: 0.7,
  },
  submitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default DownloadRequestScreen;
