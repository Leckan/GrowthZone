import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface RegisterFormProps {
  onSuccess?: () => void;
}

interface ValidationErrors {
  [key: string]: string[];
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    displayName: '',
  });
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    
    // Clear validation errors for this field when user starts typing
    if (validationErrors[e.target.name]) {
      setValidationErrors({
        ...validationErrors,
        [e.target.name]: []
      });
    }
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    return errors;
  };

  const validateUsername = (username: string): string[] => {
    const errors: string[] = [];
    
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    
    if (username.length > 50) {
      errors.push('Username must be less than 50 characters');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    // Client-side validation
    const errors: ValidationErrors = {};
    
    // Email validation
    if (!formData.email) {
      errors.email = ['Email is required'];
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = ['Please enter a valid email address'];
    }

    // Username validation
    const usernameErrors = validateUsername(formData.username);
    if (usernameErrors.length > 0) {
      errors.username = usernameErrors;
    }

    // Password validation
    const passwordErrors = validatePassword(formData.password);
    if (passwordErrors.length > 0) {
      errors.password = passwordErrors;
    }

    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = ['Passwords do not match'];
    }

    // Display Name validation
    if (formData.displayName && formData.displayName.length > 100) {
      errors.displayName = ['Display name must be less than 100 characters'];
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const success = await register({
        email: formData.email,
        password: formData.password,
        username: formData.username,
        displayName: formData.displayName || undefined,
      });

      if (success) {
        onSuccess?.();
        navigate('/communities');
      } else {
        setError('Registration failed. Please check your information and try again.');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Handle API validation errors
      if (err.response?.data?.details) {
        setValidationErrors(err.response.data.details);
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('An error occurred during registration. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldError = (fieldName: string): string | null => {
    const fieldErrors = validationErrors[fieldName];
    return fieldErrors && fieldErrors.length > 0 ? fieldErrors[0] : null;
  };

  const hasFieldError = (fieldName: string): boolean => {
    return !!(validationErrors[fieldName] && validationErrors[fieldName].length > 0);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link
              to="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              sign in to your existing account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                  hasFieldError('email') ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
              />
              {getFieldError('email') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('email')}</p>
              )}
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                  hasFieldError('username') ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Username"
                value={formData.username}
                onChange={handleChange}
              />
              {getFieldError('username') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('username')}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                3-50 characters, letters, numbers, underscores, and hyphens only
              </p>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                Display Name (optional)
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                  hasFieldError('displayName') ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Display Name"
                value={formData.displayName}
                onChange={handleChange}
              />
              {getFieldError('displayName') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('displayName')}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                  hasFieldError('password') ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
              {getFieldError('password') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('password')}</p>
              )}
              <div className="mt-1 text-xs text-gray-500">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li className={formData.password.length >= 8 ? 'text-green-600' : ''}>
                    At least 8 characters
                  </li>
                  <li className={/[a-z]/.test(formData.password) ? 'text-green-600' : ''}>
                    One lowercase letter
                  </li>
                  <li className={/[A-Z]/.test(formData.password) ? 'text-green-600' : ''}>
                    One uppercase letter
                  </li>
                  <li className={/\d/.test(formData.password) ? 'text-green-600' : ''}>
                    One number
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className={`mt-1 appearance-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                  hasFieldError('confirmPassword') ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              {getFieldError('confirmPassword') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('confirmPassword')}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}