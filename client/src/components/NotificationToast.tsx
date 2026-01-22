import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  createdAt: string;
  read: boolean;
}

interface ToastNotification extends Notification {
  show: boolean;
}

interface ErrorNotification {
  id: string;
  type: 'error' | 'success' | 'warning';
  message: string;
  details?: string;
  show: boolean;
}

export function NotificationToast() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [errorNotifications, setErrorNotifications] = useState<ErrorNotification[]>([]);
  const { on, off } = useSocket();

  useEffect(() => {
    const handleNewNotification = (data: { notification: Notification }) => {
      const toastNotification: ToastNotification = {
        ...data.notification,
        show: true
      };

      setNotifications(prev => [...prev, toastNotification]);

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setNotifications(prev => 
          prev.map(n => 
            n.id === toastNotification.id ? { ...n, show: false } : n
          )
        );
      }, 5000);

      // Remove from array after animation
      setTimeout(() => {
        setNotifications(prev => 
          prev.filter(n => n.id !== toastNotification.id)
        );
      }, 5500);
    };

    // Handle error notifications
    const handleErrorNotification = (event: CustomEvent<{ message: string; details?: string }>) => {
      const errorNotification: ErrorNotification = {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        message: event.detail.message,
        details: event.detail.details,
        show: true
      };

      setErrorNotifications(prev => [...prev, errorNotification]);

      // Auto-hide after 8 seconds for errors (longer than regular notifications)
      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.map(n => 
            n.id === errorNotification.id ? { ...n, show: false } : n
          )
        );
      }, 8000);

      // Remove from array after animation
      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.filter(n => n.id !== errorNotification.id)
        );
      }, 8500);
    };

    // Handle success notifications
    const handleSuccessNotification = (event: CustomEvent<{ message: string }>) => {
      const successNotification: ErrorNotification = {
        id: `success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'success',
        message: event.detail.message,
        show: true
      };

      setErrorNotifications(prev => [...prev, successNotification]);

      // Auto-hide after 4 seconds for success
      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.map(n => 
            n.id === successNotification.id ? { ...n, show: false } : n
          )
        );
      }, 4000);

      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.filter(n => n.id !== successNotification.id)
        );
      }, 4500);
    };

    // Handle warning notifications
    const handleWarningNotification = (event: CustomEvent<{ message: string }>) => {
      const warningNotification: ErrorNotification = {
        id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'warning',
        message: event.detail.message,
        show: true
      };

      setErrorNotifications(prev => [...prev, warningNotification]);

      // Auto-hide after 6 seconds for warnings
      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.map(n => 
            n.id === warningNotification.id ? { ...n, show: false } : n
          )
        );
      }, 6000);

      setTimeout(() => {
        setErrorNotifications(prev => 
          prev.filter(n => n.id !== warningNotification.id)
        );
      }, 6500);
    };

    on('notification:new', handleNewNotification);
    
    // Add event listeners for error notifications
    window.addEventListener('show-error-notification', handleErrorNotification as EventListener);
    window.addEventListener('show-success-notification', handleSuccessNotification as EventListener);
    window.addEventListener('show-warning-notification', handleWarningNotification as EventListener);

    return () => {
      off('notification:new', handleNewNotification);
      window.removeEventListener('show-error-notification', handleErrorNotification as EventListener);
      window.removeEventListener('show-success-notification', handleSuccessNotification as EventListener);
      window.removeEventListener('show-warning-notification', handleWarningNotification as EventListener);
    };
  }, [on, off]);

  const dismissNotification = (id: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === id ? { ...n, show: false } : n
      )
    );

    setTimeout(() => {
      setNotifications(prev => 
        prev.filter(n => n.id !== id)
      );
    }, 500);
  };

  const dismissErrorNotification = (id: string) => {
    setErrorNotifications(prev => 
      prev.map(n => 
        n.id === id ? { ...n, show: false } : n
      )
    );

    setTimeout(() => {
      setErrorNotifications(prev => 
        prev.filter(n => n.id !== id)
      );
    }, 500);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'POST_LIKE':
        return '👍';
      case 'COMMENT_REPLY':
        return '💬';
      case 'COURSE_UPDATE':
        return '📚';
      case 'COMMUNITY_ANNOUNCEMENT':
        return '📢';
      case 'MEMBERSHIP_APPROVED':
        return '✅';
      case 'ACHIEVEMENT_EARNED':
        return '🏆';
      case 'LESSON_COMPLETED':
        return '🎓';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'POST_LIKE':
      case 'COMMENT_REPLY':
        return 'bg-blue-500';
      case 'COURSE_UPDATE':
      case 'LESSON_COMPLETED':
        return 'bg-green-500';
      case 'COMMUNITY_ANNOUNCEMENT':
        return 'bg-purple-500';
      case 'MEMBERSHIP_APPROVED':
        return 'bg-emerald-500';
      case 'ACHIEVEMENT_EARNED':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getErrorNotificationStyles = (type: 'error' | 'success' | 'warning') => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: 'text-red-400',
          title: 'text-red-800',
          message: 'text-red-600',
          iconSvg: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )
        };
      case 'success':
        return {
          bg: 'bg-green-50 border-green-200',
          icon: 'text-green-400',
          title: 'text-green-800',
          message: 'text-green-600',
          iconSvg: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-400',
          title: 'text-yellow-800',
          message: 'text-yellow-600',
          iconSvg: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )
        };
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {/* Error/Success/Warning Notifications */}
      {errorNotifications.map((notification) => {
        const styles = getErrorNotificationStyles(notification.type);
        return (
          <div
            key={notification.id}
            className={`
              transform transition-all duration-500 ease-in-out
              ${notification.show 
                ? 'translate-x-0 opacity-100' 
                : 'translate-x-full opacity-0'
              }
            `}
          >
            <div className={`rounded-lg shadow-lg border p-4 max-w-sm ${styles.bg}`}>
              <div className="flex items-start">
                <div className={`flex-shrink-0 ${styles.icon}`}>
                  {styles.iconSvg}
                </div>
                <div className="ml-3 flex-1">
                  <p className={`text-sm font-medium ${styles.title}`}>
                    {notification.type === 'error' ? 'Error' : 
                     notification.type === 'success' ? 'Success' : 'Warning'}
                  </p>
                  <p className={`text-sm mt-1 ${styles.message}`}>
                    {notification.message}
                  </p>
                  {notification.details && (
                    <details className="mt-2">
                      <summary className={`text-xs cursor-pointer ${styles.message} opacity-75 hover:opacity-100`}>
                        Show details
                      </summary>
                      <p className={`text-xs mt-1 font-mono ${styles.message} opacity-75`}>
                        {notification.details}
                      </p>
                    </details>
                  )}
                </div>
                <button
                  onClick={() => dismissErrorNotification(notification.id)}
                  className={`ml-2 flex-shrink-0 ${styles.icon} hover:opacity-75`}
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Regular Notifications */}
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            transform transition-all duration-500 ease-in-out
            ${notification.show 
              ? 'translate-x-0 opacity-100' 
              : 'translate-x-full opacity-0'
            }
          `}
        >
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm">
            <div className="flex items-start">
              <div className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm
                ${getNotificationColor(notification.type)}
              `}>
                {getNotificationIcon(notification.type)}
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {notification.title}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {notification.message}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(notification.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}