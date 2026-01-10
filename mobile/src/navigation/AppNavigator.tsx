import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { BlurView } from '@react-native-community/blur';

import { useAuth } from '../context/AuthContext';
import MiniPlayer from '../components/MiniPlayer';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import SplashScreen from '../screens/common/SplashScreen';
import DownloadRequestScreen from '../screens/main/DownloadRequestScreen';
import HomeScreen from '../screens/main/HomeScreen';
import LibraryScreen from '../screens/main/LibraryScreen';
import ArtistDetailScreen from '../screens/main/ArtistDetailScreen';
import NowPlayingScreen from '../screens/main/NowPlayingScreen';
import PlaylistDetailScreen from '../screens/main/PlaylistDetailScreen';
import SearchScreen from '../screens/main/SearchScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import CreatePlaylistScreen from '../screens/main/CreatePlaylistScreen';
import AlbumDetailScreen from '../screens/main/AlbumDetailScreen';
import { useLanguage } from '../context/LanguageContext';
import { MiniPlayerVisibilityProvider } from '../context/MiniPlayerContext';
import { useThemeAccent } from '../context/ThemeContext';
import { useAccentColor } from '../hooks/useAccentColor';
import { hexToRgba } from '../utils/color';
import type {
  AppStackParamList,
  AppTabsParamList,
  AuthStackParamList,
  LibraryStackParamList,
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator<AppTabsParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();

type TabIconConfig = {
  default: string;
  active: string;
};

const TAB_ICON_MAP: Record<keyof AppTabsParamList, TabIconConfig> = {
  Home: { default: 'home-outline', active: 'home' },
  Library: { default: 'library-outline', active: 'library' },
  Create: { default: 'add-circle-outline', active: 'add-circle' },
  Search: { default: 'search-outline', active: 'search' },
};

const TAB_BAR_BASE_HEIGHT = 92;

const AuthNavigator = () => (
  <AuthStack.Navigator
    screenOptions={{
      headerShown: false,
      animation: 'fade',
    }}
  >
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Signup" component={SignupScreen} />
  </AuthStack.Navigator>
);

const AppTabsNavigator = () => {
  const [libraryKey, setLibraryKey] = useState(0);

  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }} tabBar={customTabBarRenderer}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen
        name="Library"
        listeners={{
          blur: () => setLibraryKey(prev => prev + 1),
        }}
      >
        {() => <LibraryStackNavigator key={`library-stack-${libraryKey}`} />}
      </Tabs.Screen>
      <Tabs.Screen name="Create" component={CreatePlaylistScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
    </Tabs.Navigator>
  );
};

const LibraryStackNavigator = () => (
  <LibraryStack.Navigator
    screenOptions={{
      headerStyle: {
        backgroundColor: '#0a0a0a',
      },
      headerTintColor: '#ffffff',
      headerTitleStyle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
      },
      headerShadowVisible: false,
    }}
  >
    <LibraryStack.Screen
      name="LibraryMain"
      component={LibraryScreen}
      options={{
        title: 'Library',
      }}
    />
    <LibraryStack.Screen
      name="PlaylistDetail"
      component={PlaylistDetailScreen}
      options={{ headerShown: false }}
    />
    <LibraryStack.Screen
      name="ArtistDetail"
      component={ArtistDetailScreen}
      options={({ route }) => ({
        title: route.params.artistName,
      })}
    />
    <LibraryStack.Screen
      name="AlbumDetail"
      component={AlbumDetailScreen}
      options={({ route }) => ({
        title: route.params.albumTitle ?? 'Album',
      })}
    />
  </LibraryStack.Navigator>
);

const AppStackNavigator = () => {
  const { t } = useLanguage();

  return (
    <MiniPlayerVisibilityProvider>
      <AppStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <AppStack.Screen name="Tabs" component={AppTabsNavigator} />
        <AppStack.Screen name="DownloadRequest" component={DownloadRequestScreen} />
        <AppStack.Screen
          name="NowPlaying"
          component={NowPlayingScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <AppStack.Screen
          name="ArtistDetail"
          component={ArtistDetailScreen}
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: true,
            headerStyle: {
              backgroundColor: '#0a0a0a',
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: '600',
            },
            headerShadowVisible: false,
          }}
        />
        <AppStack.Screen
          name="AlbumDetail"
          component={AlbumDetailScreen}
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: true,
            headerStyle: {
              backgroundColor: '#0a0a0a',
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: '600',
            },
            headerShadowVisible: false,
          }}
        />
        <AppStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            headerShown: true,
            headerStyle: {
              backgroundColor: '#0a0a0a',
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              color: '#ffffff',
              fontSize: 18,
              fontWeight: '600',
            },
            headerShadowVisible: false,
            title: t('tabs.Settings'),
          }}
        />
      </AppStack.Navigator>
      <MiniPlayer />
      <View style={tabStyles.miniPlayerSpacer} pointerEvents="box-none" />
    </MiniPlayerVisibilityProvider>
  );
};

const AppNavigator = () => {
  const {
    state: { isBootstrapped, user },
  } = useAuth();
  const { accentOption } = useThemeAccent();

  const navigationTheme = useMemo(() => ({
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#0a0a0a',
      card: '#1a1a1a',
      primary: accentOption.colors[0],
      text: '#ffffff',
      border: 'rgba(255, 255, 255, 0.1)',
      notification: accentOption.colors[0],
    },
  }), [accentOption]);

  if (!isBootstrapped) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? <AppStackNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;

const tabStyles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    gap: 12,
    zIndex: 50,
    elevation: 16,
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBackground: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(13,13,20,0.45)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  iconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  iconBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  iconLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c8297',
  },
  iconLabelActive: {
    color: '#ffffff',
  },
  searchBubble: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: 'rgba(13,13,20,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  miniPlayerSpacer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
});

type TabBarIconProps = {
  label: string;
  iconName: string;
  activeIconName?: string;
  focused: boolean;
  activeColor: string;
};

const TabBarIcon = ({ label, iconName, activeIconName, focused, activeColor }: TabBarIconProps) => {
  const resolvedIcon = focused && activeIconName ? activeIconName : iconName;
  return (
    <View
      style={[
        tabStyles.iconBadge,
        focused && [
          tabStyles.iconBadgeActive,
          {
            borderColor: hexToRgba(activeColor, 0.55),
            backgroundColor: hexToRgba(activeColor, 0.18),
          },
        ],
      ]}
    >
      <Icon name={resolvedIcon} size={20} color={focused ? activeColor : '#7c8297'} />
      <Text style={[tabStyles.iconLabel, focused && tabStyles.iconLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const customTabBarRenderer = (props: BottomTabBarProps) => <CustomTabBar {...props} />;

const CustomTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { primary } = useAccentColor();
  const searchRoute = state.routes.find(route => route.name === 'Search');
  const mainRoutes = state.routes.filter(route => route.name !== 'Search');
  const labelMap: Record<string, string> = {
    Home: t('tabs.Home'),
    Library: t('tabs.Library'),
    Create: t('tabs.Create'),
    Search: t('tabs.Search'),
  };

  const handlePress = (routeName: string, key: string, isFocused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    
    // If Library tab is pressed while already focused, navigate to root
    if (isFocused && routeName === 'Library' && !event.defaultPrevented) {
      navigation.navigate('Library', { screen: 'LibraryMain' });
      return;
    }
    
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const searchRouteIndex = searchRoute ? state.routes.findIndex(r => r.key === searchRoute.key) : -1;
  const isSearchFocused = searchRouteIndex === state.index;

  const bottomOffset = Math.max(insets.bottom, 12);
  const containerHeight = bottomOffset + TAB_BAR_BASE_HEIGHT;

  return (
    <View pointerEvents="box-none" style={[tabStyles.wrapper, { height: containerHeight }]}> 
      <View
        pointerEvents="box-none"
        style={[tabStyles.floatingContainer, { bottom: bottomOffset }]}
      >
        <View style={tabStyles.tabBackground}>
          <View pointerEvents="none" style={tabStyles.blurLayer}>
            <BlurView
              style={StyleSheet.absoluteFillObject}
              blurType="dark"
              blurAmount={20}
              reducedTransparencyFallbackColor="rgba(5,5,10,0.92)"
            />
          </View>
          {mainRoutes.map(route => {
            const routeIndex = state.routes.findIndex(r => r.key === route.key);
            const isFocused = state.index === routeIndex;
            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={() => handlePress(route.name, route.key, isFocused)}
                style={tabStyles.tabButton}
              >
                <TabBarIcon
                  label={labelMap[route.name] ?? route.name}
                  iconName={TAB_ICON_MAP[route.name as keyof AppTabsParamList]?.default ?? 'ellipse-outline'}
                  activeIconName={TAB_ICON_MAP[route.name as keyof AppTabsParamList]?.active}
                  focused={isFocused}
                  activeColor={primary}
                />
              </TouchableOpacity>
            );
          })}
        </View>
        {searchRoute ? (
          <TouchableOpacity
            style={[
              tabStyles.searchBubble,
              isSearchFocused && {
                borderColor: hexToRgba(primary, 0.6),
                backgroundColor: hexToRgba(primary, 0.18),
              },
            ]}
            onPress={() => handlePress(searchRoute.name, searchRoute.key, isSearchFocused)}
          >
            <View pointerEvents="none" style={tabStyles.blurLayer}>
              <BlurView
                style={StyleSheet.absoluteFillObject}
                blurType="dark"
                blurAmount={20}
                reducedTransparencyFallbackColor="rgba(5,5,10,0.92)"
              />
            </View>
            <Icon
              name={isSearchFocused ? TAB_ICON_MAP.Search.active : TAB_ICON_MAP.Search.default}
              size={24}
              color={primary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};
