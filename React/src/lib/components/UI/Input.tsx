import React, { forwardRef } from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={`input-wrapper ${fullWidth ? 'input-full-width' : ''}`}>
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <div
          className={`input-container ${icon ? `has-icon icon-${iconPosition}` : ''} ${
            error ? 'has-error' : ''
          }`}
        >
          {icon && iconPosition === 'left' && (
            <span className="input-icon">{icon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`input ${className}`}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <span className="input-icon">{icon}</span>
          )}
        </div>
        {error && <span className="input-error">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

