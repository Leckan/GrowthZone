import { Server, Socket } from 'socket.io';
import { verifyAccessToken, JwtPayload } from './auth';
import prisma from './prisma';

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    username: string;
    displayName?: string | null;
  };
}

export class SocketService {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Set up Socket.io middleware for authentication
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          // Allow anonymous connections for public content
          console.log('Anonymous socket connection:', socket.id);
          return next();
        }

        // Verify JWT token
        const payload: JwtPayload = verifyAccessToken(token);
        
        // Fetch user from database
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            emailVerified: true
          }
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        // Attach user to socket
        socket.user = user;
        console.log('Authenticated socket connection:', socket.id, 'User:', user.username);
        
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Set up Socket.io event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log('Socket connected:', socket.id, socket.user ? `(${socket.user.username})` : '(anonymous)');

      // Handle joining community rooms
      socket.on('join-community', async (communityId: string) => {
        try {
          // Verify user has access to the community
          const hasAccess = await this.verifyCommunitAccess(socket.user?.id, communityId);
          
          if (hasAccess) {
            socket.join(`community-${communityId}`);
            console.log(`Socket ${socket.id} joined community ${communityId}`);
            
            // Notify other members of the community about new connection (optional)
            if (socket.user) {
              socket.to(`community-${communityId}`).emit('community:member_online', {
                userId: socket.user.id,
                username: socket.user.username,
                displayName: socket.user.displayName
              });
            }
          } else {
            socket.emit('error', { message: 'Access denied to community' });
          }
        } catch (error) {
          console.error('Error joining community:', error);
          socket.emit('error', { message: 'Failed to join community' });
        }
      });

      // Handle leaving community rooms
      socket.on('leave-community', (communityId: string) => {
        socket.leave(`community-${communityId}`);
        console.log(`Socket ${socket.id} left community ${communityId}`);
        
        // Notify other members about user going offline (optional)
        if (socket.user) {
          socket.to(`community-${communityId}`).emit('community:member_offline', {
            userId: socket.user.id,
            username: socket.user.username
          });
        }
      });

      // Handle joining user-specific notification room
      socket.on('join-notifications', () => {
        if (socket.user) {
          socket.join(`user-${socket.user.id}`);
          console.log(`Socket ${socket.id} joined notifications for user ${socket.user.id}`);
        } else {
          socket.emit('error', { message: 'Authentication required for notifications' });
        }
      });

      // Handle real-time typing indicators
      socket.on('typing-start', (data: { communityId: string; postId?: string }) => {
        if (socket.user) {
          socket.to(`community-${data.communityId}`).emit('user-typing', {
            userId: socket.user.id,
            username: socket.user.username,
            postId: data.postId,
            timestamp: new Date().toISOString()
          });
        }
      });

      socket.on('typing-stop', (data: { communityId: string; postId?: string }) => {
        if (socket.user) {
          socket.to(`community-${data.communityId}`).emit('user-stopped-typing', {
            userId: socket.user.id,
            postId: data.postId
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', socket.id, 'Reason:', reason);
        
        // Notify communities about user going offline
        if (socket.user) {
          // Get all rooms the socket was in and notify about offline status
          const rooms = Array.from(socket.rooms);
          rooms.forEach(room => {
            if (room.startsWith('community-')) {
              socket.to(room).emit('community:member_offline', {
                userId: socket.user!.id,
                username: socket.user!.username
              });
            }
          });
        }
      });
    });
  }

  /**
   * Verify if a user has access to a community
   */
  private async verifyCommunitAccess(userId: string | undefined, communityId: string): Promise<boolean> {
    try {
      const community = await prisma.community.findUnique({
        where: { id: communityId },
        select: {
          id: true,
          isPublic: true,
          memberships: userId ? {
            where: {
              userId: userId,
              status: 'active'
            },
            select: { id: true }
          } : undefined
        }
      });

      if (!community) {
        return false;
      }

      // Public communities are accessible to everyone
      if (community.isPublic) {
        return true;
      }

      // Private communities require membership
      if (userId && community.memberships && community.memberships.length > 0) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error verifying community access:', error);
      return false;
    }
  }

  /**
   * Broadcast new post to community members
   */
  public broadcastNewPost(communityId: string, post: any): void {
    this.io.to(`community-${communityId}`).emit('community:new_post', {
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        postType: post.postType,
        author: post.author,
        createdAt: post.createdAt,
        likeCount: post.likeCount,
        commentCount: post.commentCount
      }
    });
  }

  /**
   * Broadcast new comment to community members
   */
  public broadcastNewComment(communityId: string, postId: string, comment: any): void {
    this.io.to(`community-${communityId}`).emit('community:new_comment', {
      postId,
      comment: {
        id: comment.id,
        content: comment.content,
        author: comment.author,
        createdAt: comment.createdAt,
        parentId: comment.parentId,
        likeCount: comment.likeCount
      }
    });
  }

  /**
   * Broadcast member joined event
   */
  public broadcastMemberJoined(communityId: string, member: any): void {
    this.io.to(`community-${communityId}`).emit('community:member_joined', {
      member: {
        id: member.id,
        username: member.username,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        joinedAt: member.joinedAt
      }
    });
  }

  /**
   * Broadcast member left event
   */
  public broadcastMemberLeft(communityId: string, member: any): void {
    this.io.to(`community-${communityId}`).emit('community:member_left', {
      member: {
        id: member.id,
        username: member.username,
        displayName: member.displayName
      }
    });
  }

  /**
   * Send notification to specific user
   */
  public sendUserNotification(userId: string, notification: any): void {
    this.io.to(`user-${userId}`).emit('notification:new', {
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: notification.createdAt,
        read: notification.read
      }
    });
  }

  /**
   * Broadcast points awarded event
   */
  public broadcastPointsAwarded(userId: string, communityId: string, points: number, reason: string): void {
    // Send to user's notification room
    this.io.to(`user-${userId}`).emit('user:points_awarded', {
      points,
      reason,
      communityId,
      timestamp: new Date().toISOString()
    });

    // Also broadcast to community if it's a significant achievement
    if (points >= 50) {
      this.io.to(`community-${communityId}`).emit('community:member_achievement', {
        userId,
        points,
        reason,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Broadcast lesson completion event
   */
  public broadcastLessonCompleted(userId: string, communityId: string, lessonId: string, courseId: string): void {
    this.io.to(`user-${userId}`).emit('course:lesson_completed', {
      lessonId,
      courseId,
      communityId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get Socket.io instance
   */
  public getIO(): Server {
    return this.io;
  }
}