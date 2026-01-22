import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

interface TypingUser {
  userId: string;
  username: string;
  postId?: string;
  timestamp: string;
}

interface TypingIndicatorProps {
  communityId: string;
  postId?: string;
  currentUserId?: string;
}

export function TypingIndicator({ communityId, postId, currentUserId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const { on, off } = useSocket();

  useEffect(() => {
    const handleUserTyping = (data: TypingUser) => {
      // Only show typing for the relevant post (or general community if no postId)
      if (postId && data.postId !== postId) return;
      if (!postId && data.postId) return;
      
      // Don't show own typing
      if (data.userId === currentUserId) return;

      setTypingUsers(prev => {
        // Remove existing entry for this user
        const filtered = prev.filter(u => u.userId !== data.userId);
        // Add new entry
        return [...filtered, data];
      });
    };

    const handleUserStoppedTyping = (data: { userId: string; postId?: string }) => {
      // Only handle for the relevant post
      if (postId && data.postId !== postId) return;
      if (!postId && data.postId) return;

      setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
    };

    on('user-typing', handleUserTyping);
    on('user-stopped-typing', handleUserStoppedTyping);

    return () => {
      off('user-typing', handleUserTyping);
      off('user-stopped-typing', handleUserStoppedTyping);
    };
  }, [on, off, postId, currentUserId]);

  // Auto-remove typing indicators after 10 seconds of inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setTypingUsers(prev => 
        prev.filter(user => {
          const userTime = new Date(user.timestamp).getTime();
          return now - userTime < 10000; // 10 seconds
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (typingUsers.length === 0) {
    return null;
  }

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].username} is typing...`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0].username} and ${typingUsers[1].username} are typing...`;
    } else {
      return `${typingUsers[0].username} and ${typingUsers.length - 1} others are typing...`;
    }
  };

  return (
    <div className="flex items-center space-x-2 text-sm text-gray-500 py-2">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
      </div>
      <span>{getTypingText()}</span>
    </div>
  );
}

// Hook for managing typing state
export function useTypingIndicator(communityId: string, postId?: string) {
  const { startTyping, stopTyping } = useSocket();
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleStartTyping = () => {
    if (!isTyping) {
      startTyping(communityId, postId);
      setIsTyping(true);
    }

    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Set new timeout to stop typing after 3 seconds of inactivity
    const timeout = setTimeout(() => {
      handleStopTyping();
    }, 3000);

    setTypingTimeout(timeout);
  };

  const handleStopTyping = () => {
    if (isTyping) {
      stopTyping(communityId, postId);
      setIsTyping(false);
    }

    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      if (isTyping) {
        stopTyping(communityId, postId);
      }
    };
  }, []);

  return {
    handleStartTyping,
    handleStopTyping,
    isTyping
  };
}