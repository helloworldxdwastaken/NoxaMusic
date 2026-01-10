import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAccentColor } from '../../hooks/useAccentColor';

import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const {
    state: { isAuthenticating },
    login,
  } = useAuth();
  const { primary } = useAccentColor();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Missing information', 'Please enter both username and password.');
      return;
    }

    try {
      await login(username.trim(), password, rememberMe);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.';
      Alert.alert('Login failed', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.card}>
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
        <Text style={styles.title}>Welcome to Noxa Music</Text>
        <Text style={styles.subtitle}>Sign in to access your library anywhere.</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          editable={!isAuthenticating}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isAuthenticating}
        />

        <View style={styles.rememberRow}>
          <TouchableOpacity
            style={[styles.checkbox, rememberMe && { backgroundColor: primary, borderColor: primary }]}
            onPress={() => setRememberMe(prev => !prev)}
            disabled={isAuthenticating}
          >
            {rememberMe && <View style={styles.checkboxDot} />}
          </TouchableOpacity>
          <Text style={styles.rememberLabel}>Stay signed in</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: primary }, isAuthenticating && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Signup')}
          disabled={isAuthenticating}
        >
          <Text style={styles.linkText}>New here? Create an account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#000000',
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 4,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#9090a5',
  },
  input: {
    backgroundColor: '#282828',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4b4b61',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
  rememberLabel: {
    color: '#e6e6f2',
  },
  button: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: '#8aa4ff',
  },
});

export default LoginScreen;
