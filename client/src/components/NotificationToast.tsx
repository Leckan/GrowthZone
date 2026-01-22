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

export function NotificationToast() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
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

    on('notification:new', handleNewNotification);

    return () => {
      off('notification:new', handleNewNotification);
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

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
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