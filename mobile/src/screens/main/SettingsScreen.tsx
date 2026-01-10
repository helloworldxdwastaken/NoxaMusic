import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { SupportedLanguage } from '../../i18n/translations';
import { accentOptionsList, useThemeAccent } from '../../context/ThemeContext';
import { useAccentColor } from '../../hooks/useAccentColor';
import { useMiniPlayerVisibility } from '../../context/MiniPlayerContext';

const SettingsScreen: React.FC = () => {
  const {
    state: { user },
    logout,
  } = useAuth();
  
  const { hide, show } = useMiniPlayerVisibility();

  // Hide mini player when entering Settings, show when leaving
  useEffect(() => {
    hide();
    return () => {
      show();
    };
  }, [hide, show]);

  const { t, language, setLanguage } = useLanguage();
  const { accentId, setAccent } = useThemeAccent();
  const { primary } = useAccentColor();

  const handleLogout = async () => {
    await logout();
  };

  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info Section */}
        {user && (
          <View style={styles.userSection}>
            <View style={[styles.userAvatar, { backgroundColor: primary }]}>
              <Text style={styles.userAvatarText}>
                {user.username?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.username}>{user.username}</Text>
            {user.email && <Text style={styles.userEmail}>{user.email}</Text>}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.languageTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('settings.languageSubtitle')}</Text>
          <View style={styles.languageToggle}>
            {(['en', 'es'] as SupportedLanguage[]).map(option => {
              const isActive = language === option;
              const flag = option === 'en' ? '🇺🇸' : '🇪🇸';
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.languageBtn, isActive && styles.languageBtnActive]}
                  onPress={() => setLanguage(option)}
                >
                  <Text
                    style={[
                      styles.languageBtnLabel,
                      isActive && styles.languageBtnLabelActive,
                    ]}
                  >
                    {`${flag} ${option === 'en' ? t('settings.english') : t('settings.spanish')}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.accentTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('settings.accentSubtitle')}</Text>
          <View style={styles.accentOptions}>
            {accentOptionsList.map(option => {
              const isActive = accentId === option.id;
              const label = t(option.description as any);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.accentOption,
                    isActive && [styles.accentOptionActive, { borderColor: primary }],
                  ]}
                  onPress={() => setAccent(option.id)}
                >
                  <View style={[styles.accentSwatch, isActive && { borderColor: primary }]}>
                    {option.colors.map((color, index) => (
                      <View
                        key={`${option.id}-${color}-${index}`}
                        style={[
                          styles.accentSwatchSegment,
                          index === 0 && styles.accentSwatchSegmentLeft,
                          index === option.colors.length - 1 && styles.accentSwatchSegmentRight,
                          { backgroundColor: color },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.accentLabel, isActive && { color: primary }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.accountTitle')}</Text>
          <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleLogout}>
            <Text style={styles.buttonText}>{t('settings.signOut')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingTop: 16,
    gap: 24,
  },
  userSection: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  userAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  userAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  userEmail: {
    fontSize: 14,
    color: '#9090a5',
  },
  section: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: '#9090a5',
  },
  input: {
    backgroundColor: '#282828',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
  },
  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  languageBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  languageBtnActive: {
    backgroundColor: '#ffffff',
  },
  languageBtnLabel: {
    fontWeight: '600',
    color: '#9090a5',
  },
  languageBtnLabelActive: {
    color: '#050505',
  },
  button: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#f87171',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  accentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  accentOption: {
    flexGrow: 1,
    minWidth: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  accentOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  accentSwatch: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  accentSwatchSegment: {
    flex: 1,
    height: 26,
  },
  accentSwatchSegmentLeft: {
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  accentSwatchSegmentRight: {
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  accentLabel: {
    color: '#d1d5db',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default SettingsScreen;
