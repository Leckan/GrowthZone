import { useEffect } from 'react';
import { ApiError } from '../services/api';

interface GlobalErrorHandlerOptions {
  onAuthError?: (error: ApiError) => void;
  onNetworkError?: (error: Error) => void;
  onUnhandledError?: (error: Error) => void;
}

export const useGlobalErrorHandler = (options: GlobalErrorHandlerOptions = {}) => {
  useEffect(() => {
    // Handle authentication errors
    const handleAuthError = (event: CustomEvent<ApiError>) => {
      const error = event.detail;
      
      if (options.onAuthError) {
        options.onAuthError(error);
      } else {
        // Default behavior: redirect to login
        console.warn('Authentication error:', error.message);
        window.location.href = '/login';
      }
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      if (options.onUnhandledError) {
        options.onUnhandledError(new Error(event.reason));
      }
      
      // Prevent the default browser behavior
      event.preventDefault();
    };

    // Handle global JavaScript errors
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      
      if (options.onUnhandledError) {
        options.onUnhandledError(event.error);
      }
    };

    // Handle network errors
    const handleNetworkError = (event: CustomEvent<Error>) => {
      const error = event.detail;
      
      if (options.onNetworkError) {
        options.onNetworkError(error);
      } else {
        console.error('Network error:', error.message);
        // You could show a toast notification here
      }
    };

    // Add event listeners
    window.addEventListener('auth-error', handleAuthError as EventListener);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('network-error', handleNetworkError as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('auth-error', handleAuthError as EventListener);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('network-error', handleNetworkError as EventListener);
    };
  }, [options]);
};

// Error notification hook
export const useErrorNotification = () => {
  const showError = (message: string, details?: string) => {
    // Create a custom event for error notifications
    const event = new CustomEvent('show-error-notification', {
      detail: { message, details }
    });
    window.dispatchEvent(event);
  };

  const showSuccess = (message: string) => {
    const event = new CustomEvent('show-success-notification', {
      detail: { message }
    });
    window.dispatchEvent(event);
  };

  const showWarning = (message: string) => {
    const event = new CustomEvent('show-warning-notification', {
      detail: { message }
    });
    window.dispatchEvent(event);
  };

  return {
    showError,
    showSuccess,
    showWarning
  };
};