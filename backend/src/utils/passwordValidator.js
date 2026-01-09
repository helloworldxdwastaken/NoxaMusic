/**
 * Password validation utility
 * Enforces strong password requirements
 */

/**
 * Validate password strength
 * @param {String} password - Password to validate
 * @returns {Object} { valid: Boolean, errors: Array }
 */
export function validatePassword(password) {
  const errors = [];
  
  // Check if password exists
  if (!password) {
    return {
      valid: false,
      errors: ['Password is required']
    };
  }
  
  // Minimum length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  // Maximum length check (prevent DoS attacks with huge passwords)
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }
  
  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  // Check for at least one number
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  }
  
  // Check for common weak passwords
  const commonPasswords = [
    'password', 'password123', '12345678', 'qwerty123', 
    'abc123', 'letmein', 'welcome', 'monkey', '1234567890'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger password');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate username
 * @param {String} username - Username to validate
 * @returns {Object} { valid: Boolean, errors: Array }
 */
export function validateUsername(username) {
  const errors = [];
  
  if (!username) {
    return {
      valid: false,
      errors: ['Username is required']
    };
  }
  
  // Length checks
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (username.length > 30) {
    errors.push('Username must be less than 30 characters');
  }
  
  // Character check - alphanumeric, underscore, hyphen only
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }
  
  // Must start with a letter or number
  if (!/^[a-zA-Z0-9]/.test(username)) {
    errors.push('Username must start with a letter or number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  validatePassword,
  validateUsername
};

