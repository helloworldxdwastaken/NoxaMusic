import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fallbackLanguage, SupportedLanguage, translate } from '../i18n/translations';

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'noxa.language';

const detectDeviceLanguage = (): SupportedLanguage => {
  try {
    const locale =
      Platform.OS === 'ios'
        ? NativeModules.SettingsManager?.settings?.AppleLocale ||
          NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        : NativeModules.I18nManager?.localeIdentifier;
    if (!locale) {
      return fallbackLanguage;
    }
    const code = locale.replace('_', '-').split('-')[0]?.toLowerCase();
    return (['en', 'es'] as SupportedLanguage[]).includes(code as SupportedLanguage)
      ? (code as SupportedLanguage)
      : fallbackLanguage;
  } catch {
    return fallbackLanguage;
  }
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<SupportedLanguage>(detectDeviceLanguage());

  useEffect(() => {
    let isMounted = true;
    const bootstrapLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if ((['en', 'es'] as SupportedLanguage[]).includes(stored as SupportedLanguage) && isMounted) {
          setLanguage(stored as SupportedLanguage);
        }
      } catch (error) {
        console.warn('Failed to load stored language', error);
      }
    };
    bootstrapLanguage().catch(error => console.warn('Failed to bootstrap language', error));
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSetLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguage(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(error =>
      console.warn('Failed to persist language', error),
    );
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage: handleSetLanguage,
      t: (key: string, vars?: Record<string, string | number>) => translate(language, key, vars),
    }),
    [handleSetLanguage, language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
