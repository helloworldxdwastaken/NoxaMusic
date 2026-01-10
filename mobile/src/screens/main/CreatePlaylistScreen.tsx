import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Icon from '../../components/Icon';

import { createPlaylist } from '../../api/service';
import type { AppStackParamList, AppTabsParamList } from '../../navigation/types';
import { useLanguage } from '../../context/LanguageContext';
import { useAccentColor } from '../../hooks/useAccentColor';

type CreateTabNav = BottomTabNavigationProp<AppTabsParamList, 'Create'>;
type RootStackNav = NativeStackNavigationProp<AppStackParamList>;
type NavigationProp = CompositeNavigationProp<CreateTabNav, RootStackNav>;

const CreatePlaylistScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { primary, onPrimary } = useAccentColor();
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setModalVisible(true);
    }, []),
  );

  const closeModal = () => setModalVisible(false);

  const openModal = () => setModalVisible(true);

  const handleCreate = async () => {
    if (creating) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t('common.error'), t('create.nameRequired'));
      return;
    }

    try {
      setCreating(true);
      const playlist = await createPlaylist(trimmedName, description.trim() || undefined);
      Alert.alert(t('common.ok'), t('create.success'));
      setModalVisible(false);
      setName('');
      setDescription('');
      navigation.navigate('Library', {
        screen: 'PlaylistDetail',
        params: {
          playlistId: playlist.id,
          playlistName: playlist.name,
          description: playlist.description,
          coverUrl: playlist.coverUrl ?? undefined,
          trackCount: playlist.trackCount ?? 0,
        },
      });
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('create.error'),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.heroCard}>
        <View style={[styles.heroIconCircle, { backgroundColor: `${primary}20` }]}>
          <Icon name="plus-square" size={28} color={primary} />
        </View>
        <Text style={styles.heroTitle}>{t('create.title')}</Text>
        <Text style={styles.heroSubtitle}>{t('create.subtitle')}</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primary }]} onPress={openModal}>
          <Icon name="plus" size={16} color={onPrimary} />
          <Text style={styles.primaryButtonText}>{t('create.openModal')}</Text>
        </TouchableOpacity>
        <Text style={styles.heroHint}>{t('create.helper')}</Text>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.sheetTitle}>{t('create.modalTitle')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('playlist.namePlaceholder')}
              placeholderTextColor="#6b7280"
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder={t('playlist.descriptionPlaceholder')}
              placeholderTextColor="#6b7280"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.primaryButtonFull,
                { backgroundColor: primary },
                creating && styles.disabledButton,
              ]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color={onPrimary} />
              ) : (
                <>
                  <Icon name="check" size={16} color={onPrimary} />
                  <Text style={styles.primaryButtonText}>{t('create.createButton')}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={closeModal}>
              <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
  },
  heroCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
  },
  heroHint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
  },
  primaryButtonFull: {
    width: '100%',
    borderRadius: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  secondaryButtonText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  sheetTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default CreatePlaylistScreen;
