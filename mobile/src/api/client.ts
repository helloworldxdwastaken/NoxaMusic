import axios from 'axios';
import { encode as encodeBase64 } from 'base-64';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AdminCredentials, User } from '../types/models';

const DEFAULT_BASE_URL = 'https://stream.noxamusic.com';

export const STORAGE_KEYS = {
  baseUrl: 'serverURL',
  token: 'authToken',
  user: 'currentUser',
  adminCredentials: 'adminCredentials',
} as const;

let authToken: string | null = null;
let adminCredentials: AdminCredentials | null = null;

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | undefined;

export const apiClient = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 20000,
});

apiClient.interceptors.request.use(config => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | undefined) => {
  unauthorizedHandler = handler;
};

export const setAuthToken = async (token: string | null, persist = true) => {
  authToken = token;
  if (persist) {
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEYS.token, token);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.token);
    }
  }
};

export const getAuthToken = () => authToken;

export const setAdminAuth = async (creds: AdminCredentials | null, persist = true) => {
  adminCredentials = creds;
  if (persist) {
    if (creds) {
      await AsyncStorage.setItem(STORAGE_KEYS.adminCredentials, JSON.stringify(creds));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.adminCredentials);
    }
  }
};

export const getAdminAuthHeader = () => {
  if (!adminCredentials) {
    return undefined;
  }
  const login = `${adminCredentials.username}:${adminCredentials.password}`;
  const encoded = encodeBase64(login);
  return `Basic ${encoded}`;
};

export const setBaseUrl = async (url: string, persist = true) => {
  const sanitized = url.replace(/\/+$/, '');
  apiClient.defaults.baseURL = sanitized;
  if (persist) {
    await AsyncStorage.setItem(STORAGE_KEYS.baseUrl, sanitized);
  }
};

export const getBaseUrl = () => apiClient.defaults.baseURL ?? DEFAULT_BASE_URL;

export interface BootstrapState {
  baseUrl: string;
  token: string | null;
  user: User | null;
  adminCredentials: AdminCredentials | null;
}

export const bootstrapApiClient = async (): Promise<BootstrapState> => {
  const [[, storedBaseUrl], [, storedToken], [, storedUser], [, storedAdmin]] = await AsyncStorage.multiGet(
    [
      STORAGE_KEYS.baseUrl,
      STORAGE_KEYS.token,
      STORAGE_KEYS.user,
      STORAGE_KEYS.adminCredentials,
    ],
  );

  const baseUrl = storedBaseUrl || DEFAULT_BASE_URL;
  await setBaseUrl(baseUrl, false);

  const token = storedToken ?? null;
  await setAuthToken(token, false);

  let user: User | null = null;
  if (storedUser) {
    try {
      user = JSON.parse(storedUser);
    } catch {
      user = null;
    }
  }

  let admin: AdminCredentials | null = null;
  if (storedAdmin) {
    try {
      admin = JSON.parse(storedAdmin);
    } catch {
      admin = null;
    }
  }
  await setAdminAuth(admin, false);

  return { baseUrl, token, user, adminCredentials: admin };
};

export const persistUser = async (user: User | null) => {
  if (user) {
    await AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.user);
  }
};

