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
  
  if (lowerError.includes('username') && (lowerError.includes('taken') || lowerError.includes('exists'))) {
    return 'fa-user-times'; // Username taken
  }
  if (lowerError.includes('email') && (lowerError.includes('taken') || lowerError.includes('exists') || lowerError.includes('already'))) {
    return 'fa-envelope-circle-xmark'; // Email taken
  }
  if (lowerError.includes('password') && (lowerError.includes('weak') || lowerError.includes('match') || lowerError.includes('short'))) {
    return 'fa-lock'; // Password issue
  }
  if (lowerError.includes('invalid')) {
    return 'fa-triangle-exclamation'; // Invalid input
  }
  if (lowerError.includes('server') || lowerError.includes('500')) {
    return 'fa-server'; // Server error
  }
  
  return 'fa-exclamation-circle'; // Generic error
}

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { signup, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

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
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    const success = await signup(username, password, email);
    if (success) {
      navigate('/');
    }
  };

  const displayError = localError || error;

  return (
    <div className="auth-page">
      <div className="auth-container glass-elevated">
        <div className="auth-header">
          <div className="auth-logo-icon">
            <img src="/icons/icon.svg" alt="Noxa Music" />
          </div>
          <h1 className="auth-logo">Noxa Music</h1>
          <h2>Create account</h2>
          <p>Start your music journey</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <Input
            label="Username"
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            disabled={isLoading}
            autoFocus
          />

          <Input
            label="Email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            disabled={isLoading}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            disabled={isLoading}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            disabled={isLoading}
          />

          {displayError && (
            <div className="auth-error">
              <i className={`fas ${getErrorIcon(displayError)}`}></i>
              <span>{displayError}</span>
            </div>
          )}

          <Button type="submit" fullWidth isLoading={isLoading} size="lg">
            Create Account
          </Button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;

