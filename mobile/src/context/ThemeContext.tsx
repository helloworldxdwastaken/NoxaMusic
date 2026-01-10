import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AccentId = 'green' | 'purple' | 'blue' | 'red';

export type AccentOption = {
  id: AccentId;
  name: string;
  colors: readonly string[];
  preview?: readonly string[];
  description: string;
  onPrimary: string;
};

const ACCENT_STORAGE_KEY = 'noxa.accent';

export const ACCENT_OPTIONS: Record<AccentId, AccentOption> = {
  green: {
    id: 'green',
    name: 'Spotify Green',
    colors: ['#1db954'],
    description: 'settings.accentOptionGreen',
    onPrimary: '#050505',
  },
  purple: {
    id: 'purple',
    name: 'Vibrant Purple',
    colors: ['#8b5cf6'],
    description: 'settings.accentOptionPurple',
    onPrimary: '#ffffff',
  },
  blue: {
    id: 'blue',
    name: 'Electric Blue',
    colors: ['#2563eb'],
    description: 'settings.accentOptionBlue',
    onPrimary: '#ffffff',
  },
  red: {
    id: 'red',
    name: 'Apple Music Red',
    colors: ['#ff2d55'],
    description: 'settings.accentOptionRed',
    onPrimary: '#ffffff',
  },
};

export type ThemeContextValue = {
  accentId: AccentId;
  accentOption: AccentOption;
  setAccent: (id: AccentId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [accentId, setAccentId] = useState<AccentId>('green');

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const stored = await AsyncStorage.getItem(ACCENT_STORAGE_KEY);
        if (stored) {
          const normalized =
            stored === 'green' || stored === 'purple' || stored === 'blue' || stored === 'red'
              ? (stored as AccentId)
              : stored === 'purpleBlue'
                ? 'purple'
                : stored === 'appleRed'
                  ? 'red'
                  : null;
          if (normalized && mounted) {
            setAccentId(normalized);
            if (normalized !== stored) {
              AsyncStorage.setItem(ACCENT_STORAGE_KEY, normalized).catch(err =>
                console.warn('Failed to migrate accent preference', err),
              );
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load accent preference', error);
      }
    };
    bootstrap().catch(error => console.warn('Failed to bootstrap accent', error));
    return () => {
      mounted = false;
    };
  }, []);

  const handleSetAccent = useCallback((id: AccentId) => {
    setAccentId(id);
    AsyncStorage.setItem(ACCENT_STORAGE_KEY, id).catch(error =>
      console.warn('Failed to save accent preference', error),
    );
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ accentId, accentOption: ACCENT_OPTIONS[accentId], setAccent: handleSetAccent }),
    [accentId, handleSetAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeAccent = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeAccent must be used within ThemeProvider');
  }
  return context;
};

export const accentOptionsList = Object.values(ACCENT_OPTIONS);
