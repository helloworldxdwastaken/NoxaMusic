import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { useAccentColor } from '../../hooks/useAccentColor';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const { primary, onPrimary } = useAccentColor();
  const {
    state: { isAuthenticating },
    signup,
  } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const handleSignup = async () => {
    if (!username || !password) {
      Alert.alert('Missing information', 'Please enter a username and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Make sure both passwords match.');
      return;
    }

    try {
      await signup(username.trim(), password, rememberMe);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed.';
      Alert.alert('Signup failed', message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Sign up to sync your music across devices.</Text>

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
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
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
          <Text style={styles.rememberLabel}>Keep me signed in</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: primary }, isAuthenticating && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <ActivityIndicator color={onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.replace('Login')}
          disabled={isAuthenticating}
        >
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
    backgroundColor: '#0a0a0a',
  },
  card: {
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
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
    color: '#1db954',
    fontWeight: '600',
  },
});

export default SignupScreen;

