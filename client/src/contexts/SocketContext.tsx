import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

// Socket event types
export interface SocketEvents {
  // Community events
  'community:new_post': (data: { post: any }) => void;
  'community:new_comment': (data: { postId: string; comment: any }) => void;
  'community:member_joined': (data: { member: any }) => void;
  'community:member_left': (data: { member: any }) => void;
  'community:member_online': (data: { userId: string; username: string; displayName?: string }) => void;
  'community:member_offline': (data: { userId: string; username: string }) => void;
  'community:member_achievement': (data: { userId: string; points: number; reason: string; timestamp: string }) => void;
  
  // User events
  'user:points_awarded': (data: { points: number; reason: string; communityId: string; timestamp: string }) => void;
  'user-typing': (data: { userId: string; username: string; postId?: string; timestamp: string }) => void;
  'user-stopped-typing': (data: { userId: string; postId?: string }) => void;
  
  // Course events
  'course:lesson_completed': (data: { lessonId: string; courseId: string; communityId: string; timestamp: string }) => void;
  
  // Notification events
  'notification:new': (data: { notification: any }) => void;
  
  // Error events
  'error': (data: { message: string }) => void;
}

// Socket context type
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinCommunity: (communityId: string) => void;
  leaveCommunity: (communityId: string) => void;
  joinNotifications: () => void;
  startTyping: (communityId: string, postId?: string) => void;
  stopTyping: (communityId: string, postId?: string) => void;
  on: <K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) => void;
  off: <K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) => void;
}

// Create context
const SocketContext = createContext<SocketContextType | undefined>(undefined);

// Socket provider component
interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    // Only connect if we have environment setup
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
    // Extract base URL from API URL (remove /api/v1 suffix)
    const serverUrl = apiUrl.replace('/api/v1', '');
    
    // Create socket connection
    const newSocket = io(serverUrl, {
      auth: {
        token: token || undefined
      },
      autoConnect: false
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    // Set socket instance
    setSocket(newSocket);

    // Connect the socket
    newSocket.connect();

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [token]); // Reconnect when token changes

  // Auto-join notifications for authenticated users
  useEffect(() => {
    if (socket && isConnected && isAuthenticated) {
      socket.emit('join-notifications');
    }
  }, [socket, isConnected, isAuthenticated]);

  const joinCommunity = (communityId: string) => {
    if (socket && isConnected) {
      socket.emit('join-community', communityId);
    }
  };

  const leaveCommunity = (communityId: string) => {
    if (socket && isConnected) {
      socket.emit('leave-community', communityId);
    }
  };

  const joinNotifications = () => {
    if (socket && isConnected) {
      socket.emit('join-notifications');
    }
  };

  const startTyping = (communityId: string, postId?: string) => {
    if (socket && isConnected) {
      socket.emit('typing-start', { communityId, postId });
    }
  };

  const stopTyping = (communityId: string, postId?: string) => {
    if (socket && isConnected) {
      socket.emit('typing-stop', { communityId, postId });
    }
  };

  const on = <K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) => {
    if (socket) {
      socket.on(event as string, callback as any);
    }
  };

  const off = <K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) => {
    if (socket) {
      if (callback) {
        socket.off(event as string, callback as any);
      } else {
        socket.off(event as string);
      }
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    joinCommunity,
    leaveCommunity,
    joinNotifications,
    startTyping,
    stopTyping,
    on,
    off,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

// Custom hook to use socket context
export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}