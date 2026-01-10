import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const SplashScreen: React.FC = () => (
  <View style={styles.container}>
    <ActivityIndicator size="large" color="#ffffff" />
    <Text style={styles.text}>Loading your music…</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    gap: 12,
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
  },
});

export default SplashScreen;

