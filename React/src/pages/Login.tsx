import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/stores/auth';
import { Input } from '../lib/components/UI/Input';
import { Button } from '../lib/components/UI/Button';
import './Auth.css';

/**
 * Get appropriate icon for error type
 */
function getErrorIcon(error: string): string {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('too many') || lowerError.includes('rate limit') || lowerError.includes('attempts')) {
    return 'fa-clock'; // Rate limiting
  }
  if (lowerError.includes('credentials') || lowerError.includes('password') || lowerError.includes('invalid')) {
    return 'fa-key'; // Invalid credentials
  }
  if (lowerError.includes('not found') || lowerError.includes('user')) {
    return 'fa-user-slash'; // User not found
  }
  if (lowerError.includes('server') || lowerError.includes('500')) {
    return 'fa-server'; // Server error
  }
  if (lowerError.includes('suspended') || lowerError.includes('denied') || lowerError.includes('blocked')) {
    return 'fa-ban'; // Account suspended
  }
  
  return 'fa-exclamation-circle'; // Generic error
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container glass-elevated">
        <div className="auth-header">
          <div className="auth-logo-icon">
            <img src="/icons/icon.svg" alt="Noxa Music" />
          </div>
          <h1 className="auth-logo">Noxa Music</h1>
          <h2>Welcome back</h2>
          <p>Sign in to continue to your music</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <Input
            label="Username"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            disabled={isLoading}
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            disabled={isLoading}
          />

          {error && (
            <div className="auth-error">
              <i className={`fas ${getErrorIcon(error)}`}></i>
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" fullWidth isLoading={isLoading} size="lg">
            Sign In
          </Button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

