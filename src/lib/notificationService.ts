import prisma from './prisma';
import { emailService, EmailOptions } from './emailService';

export interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  sendEmail?: boolean;
}

export enum NotificationType {
  POST_LIKE = 'POST_LIKE',
  COMMENT_REPLY = 'COMMENT_REPLY',
  COURSE_UPDATE = 'COURSE_UPDATE',
  COMMUNITY_ANNOUNCEMENT = 'COMMUNITY_ANNOUNCEMENT',
  MEMBERSHIP_APPROVED = 'MEMBERSHIP_APPROVED',
  ACHIEVEMENT_EARNED = 'ACHIEVEMENT_EARNED',
  LESSON_COMPLETED = 'LESSON_COMPLETED',
  WEEKLY_DIGEST = 'WEEKLY_DIGEST',
}

class NotificationService {
  async createNotification(data: NotificationData): Promise<string> {
    try {
      // Create the notification in database
      const notification = await prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || {},
        },
      });

      // Send email if requested and user preferences allow it
      if (data.sendEmail !== false) {
        await this.sendEmailNotification(data.userId, data.type, data.title, data.message, data.data);
      }

      return notification.id;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  async createBulkNotifications(notifications: NotificationData[]): Promise<string[]> {
    const createdIds: string[] = [];

    for (const notification of notifications) {
      try {
        const id = await this.createNotification(notification);
        createdIds.push(id);
      } catch (error) {
        console.error('Failed to create bulk notification:', error);
      }
    }

    return createdIds;
  }

  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    } = {}
  ) {
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    return prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly && { isRead: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
      return result.count;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      return 0;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      await prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId,
        },
      });
      return true;
    } catch (error) {
      console.error('Failed to delete notification:', error);
      return false;
    }
  }

  private async sendEmailNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Get user and their notification preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { notificationPreferences: true },
      });

      if (!user || !user.email) {
        return;
      }

      // Check if user has email notifications enabled
      const prefs = user.notificationPreferences;
      if (!prefs || !prefs.emailEnabled) {
        return;
      }

      // Check type-specific preferences
      const shouldSendEmail = this.shouldSendEmailForType(type, prefs);
      if (!shouldSendEmail) {
        return;
      }

      // Generate action URL if applicable
      const actionUrl = this.generateActionUrl(type, data);

      // Send email
      const emailHtml = emailService.generateNotificationEmail(title, message, actionUrl);
      const success = await emailService.sendEmail({
        to: user.email,
        subject: title,
        html: emailHtml,
      });

      // Mark email as sent in database
      if (success) {
        await prisma.notification.updateMany({
          where: {
            userId,
            type,
            title,
            emailSent: false,
          },
          data: { emailSent: true },
        });
      }
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  private shouldSendEmailForType(type: NotificationType, prefs: any): boolean {
    switch (type) {
      case NotificationType.POST_LIKE:
        return prefs.postLikes;
      case NotificationType.COMMENT_REPLY:
        return prefs.commentReplies;
      case NotificationType.COURSE_UPDATE:
        return prefs.courseUpdates;
      case NotificationType.COMMUNITY_ANNOUNCEMENT:
        return prefs.communityAnnouncements;
      default:
        return true; // Send by default for other types
    }
  }

  private generateActionUrl(type: NotificationType, data?: Record<string, any>): string | undefined {
    if (!data) return undefined;

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    switch (type) {
      case NotificationType.POST_LIKE:
      case NotificationType.COMMENT_REPLY:
        return data.postId ? `${baseUrl}/posts/${data.postId}` : undefined;
      case NotificationType.COURSE_UPDATE:
        return data.courseId ? `${baseUrl}/courses/${data.courseId}` : undefined;
      case NotificationType.COMMUNITY_ANNOUNCEMENT:
        return data.communityId ? `${baseUrl}/communities/${data.communityId}` : undefined;
      default:
        return undefined;
    }
  }

  // Notification preference management
  async getUserPreferences(userId: string) {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return prefs;
  }

  async updateUserPreferences(userId: string, preferences: Partial<{
    emailEnabled: boolean;
    inAppEnabled: boolean;
    postLikes: boolean;
    commentReplies: boolean;
    courseUpdates: boolean;
    communityAnnouncements: boolean;
    weeklyDigest: boolean;
  }>) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...preferences,
      },
      update: preferences,
    });
  }

  // Digest functionality
  async sendWeeklyDigest(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { notificationPreferences: true },
      });

      if (!user || !user.email) {
        return false;
      }

      const prefs = user.notificationPreferences;
      if (!prefs || !prefs.emailEnabled || !prefs.weeklyDigest) {
        return false;
      }

      // Get notifications from the past week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const notifications = await prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gte: oneWeekAgo },
          type: { not: NotificationType.WEEKLY_DIGEST },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (notifications.length === 0) {
        return true; // No notifications to send
      }

      // Generate and send digest email
      const digestHtml = emailService.generateDigestEmail(notifications);
      const success = await emailService.sendEmail({
        to: user.email,
        subject: 'Your Weekly Community Digest',
        html: digestHtml,
      });

      // Create a digest notification record
      if (success) {
        await this.createNotification({
          userId,
          type: NotificationType.WEEKLY_DIGEST,
          title: 'Weekly Digest Sent',
          message: `Your weekly digest with ${notifications.length} notifications was sent to ${user.email}`,
          sendEmail: false,
        });
      }

      return success;
    } catch (error) {
      console.error('Failed to send weekly digest:', error);
      return false;
    }
  }

  async sendBulkDigests(userIds: string[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      const success = await this.sendWeeklyDigest(userId);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed };
  }

  // Announcement broadcasting
  async broadcastAnnouncement(
    communityId: string,
    title: string,
    message: string,
    sendEmail: boolean = true
  ): Promise<number> {
    try {
      // Get all active community members
      const memberships = await prisma.communityMembership.findMany({
        where: {
          communityId,
          status: 'active',
        },
        include: { user: true },
      });

      const notifications: NotificationData[] = memberships.map((membership: any) => ({
        userId: membership.userId,
        type: NotificationType.COMMUNITY_ANNOUNCEMENT,
        title,
        message,
        data: { communityId },
        sendEmail,
      }));

      const createdIds = await this.createBulkNotifications(notifications);
      return createdIds.length;
    } catch (error) {
      console.error('Failed to broadcast announcement:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();