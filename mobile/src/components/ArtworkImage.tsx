import React, { useMemo } from 'react';
import { Image, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';

// Default artwork image
const DEFAULT_ARTWORK = require('../../assets/default artwork_.jpg');

type ArtworkImageProps = {
  uri?: string | null;
  size: number;
  fallbackLabel?: string;
  shape?: 'rounded' | 'circle';
};

const isAbsoluteUri = (value: string) =>
  value.startsWith('http://') ||
  value.startsWith('https://') ||
  value.startsWith('file://') ||
  value.startsWith('data:');

const ArtworkImage: React.FC<ArtworkImageProps> = ({ 
  uri, 
  size, 
  shape = 'rounded',
}) => {
  const {
    state: { baseUrl },
  } = useAuth();

  // Compute the final image URI
  const resolvedUri = useMemo(() => {
    if (!uri) {
      return null;
    }
    if (isAbsoluteUri(uri)) {
      return uri;
    }
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedPath = uri.startsWith('/') ? uri : `/${uri}`;
    return `${normalizedBase}${normalizedPath}`;
  }, [baseUrl, uri]);

  const borderRadius = shape === 'circle' ? size / 2 : 12;

  // Simple: if we have a URI, show it with default as fallback. Otherwise show default.
  if (resolvedUri) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        style={[styles.image, { width: size, height: size, borderRadius }]}
        defaultSource={DEFAULT_ARTWORK}
      />
    );
  }

  return (
    <Image
      source={DEFAULT_ARTWORK}
      style={[styles.image, { width: size, height: size, borderRadius }]}
    />
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#1b1b21',
  },
});

export default ArtworkImage;
