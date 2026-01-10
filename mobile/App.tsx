import React from 'react';
import { StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { enableScreens } from 'react-native-screens';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (cache time)
      refetchOnWindowFocus: false,
    },
  },
});

enableScreens();
(Ionicons as unknown as { loadFont?: () => void }).loadFont?.();

const App = () => (
  <SafeAreaProvider>
    <StatusBar barStyle="light-content" backgroundColor="#0b0b0f" />
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineProvider>
          <LanguageProvider>
            <ThemeProvider>
              <AppNavigator />
            </ThemeProvider>
          </LanguageProvider>
        </OfflineProvider>
      </AuthProvider>
    </QueryClientProvider>
  </SafeAreaProvider>
);

export default App;
