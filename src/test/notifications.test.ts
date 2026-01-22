import { notificationService, NotificationType } from '../lib/notificationService';
import { emailService } from '../lib/emailService';
import { createTestUser, createTestCommunity, cleanupTestData } from './setup';
import prisma from '../lib/prisma';

describe('Notification System', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Notification Service', () => {
    let testUser: any;
    let testCommunity: any;

    beforeEach(async () => {
      testUser = await createTestUser();
      testCommunity = await createTestCommunity(testUser.id);
    });

    it('should create a notification', async () => {
      const notificationId = await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.POST_LIKE,
        title: 'Test Notification',
        message: 'This is a test notification',
        data: { postId: 'test-post-id' },
        sendEmail: false
      });

      expect(notificationId).toBeDefined();
      expect(typeof notificationId).toBe('string');
    });

    it('should get user notifications', async () => {
      // Create a test notification
      await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.COMMENT_REPLY,
        title: 'Test Comment',
        message: 'Someone replied to your comment',
        sendEmail: false
      });

      const notifications = await notificationService.getUserNotifications(testUser.id);
      
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Test Comment');
      expect(notifications[0].isRead).toBe(false);
    });

    it('should mark notification as read', async () => {
      const notificationId = await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.COURSE_UPDATE,
        title: 'Course Updated',
        message: 'A course has been updated',
        sendEmail: false
      });

      const success = await notificationService.markAsRead(notificationId, testUser.id);
      expect(success).toBe(true);

      const notifications = await notificationService.getUserNotifications(testUser.id);
      expect(notifications[0].isRead).toBe(true);
      expect(notifications[0].readAt).toBeTruthy();
    });

    it('should get unread count', async () => {
      // Create multiple notifications
      await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.POST_LIKE,
        title: 'Like 1',
        message: 'Post liked',
        sendEmail: false
      });

      await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.POST_LIKE,
        title: 'Like 2',
        message: 'Post liked again',
        sendEmail: false
      });

      const count = await notificationService.getUnreadCount(testUser.id);
      expect(count).toBe(2);
    });

    it('should mark all notifications as read', async () => {
      // Create multiple notifications
      await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.POST_LIKE,
        title: 'Like 1',
        message: 'Post liked',
        sendEmail: false
      });

      await notificationService.createNotification({
        userId: testUser.id,
        type: NotificationType.POST_LIKE,
        title: 'Like 2',
        message: 'Post liked again',
        sendEmail: false
      });

      const markedCount = await notificationService.markAllAsRead(testUser.id);
      expect(markedCount).toBe(2);

      const unreadCount = await notificationService.getUnreadCount(testUser.id);
      expect(unreadCount).toBe(0);
    });

    it('should manage notification preferences', async () => {
      const preferences = await notificationService.getUserPreferences(testUser.id);
      
      // Should create default preferences
      expect(preferences.emailEnabled).toBe(true);
      expect(preferences.inAppEnabled).toBe(true);
      expect(preferences.postLikes).toBe(true);

      // Update preferences
      const updated = await notificationService.updateUserPreferences(testUser.id, {
        emailEnabled: false,
        postLikes: false
      });

      expect(updated.emailEnabled).toBe(false);
      expect(updated.postLikes).toBe(false);
      expect(updated.inAppEnabled).toBe(true); // Should remain unchanged
    });

    it('should broadcast announcements to community members', async () => {
      // Create another user and add them to the community
      const user2 = await createTestUser({ email: 'user2@test.com', username: 'user2' });
      
      // Add user2 as a member
      await prisma.communityMembership.create({
        data: {
          userId: user2.id,
          communityId: testCommunity.id,
          status: 'active',
          role: 'member'
        }
      });

      const notificationCount = await notificationService.broadcastAnnouncement(
        testCommunity.id,
        'Community Announcement',
        'This is an important announcement for all members',
        false // Don't send email in test
      );

      expect(notificationCount).toBe(1); // Only user2 should get notification (not creator)

      // Check that user2 received the notification
      const user2Notifications = await notificationService.getUserNotifications(user2.id);
      expect(user2Notifications).toHaveLength(1);
      expect(user2Notifications[0].type).toBe(NotificationType.COMMUNITY_ANNOUNCEMENT);
    });
  });

  describe('Email Service', () => {
    it('should generate notification email HTML', () => {
      const html = emailService.generateNotificationEmail(
        'Test Title',
        'Test message content',
        'https://example.com/action'
      );

      expect(html).toContain('Test Title');
      expect(html).toContain('Test message content');
      expect(html).toContain('https://example.com/action');
      expect(html).toContain('Community Learning Platform');
    });

    it('should generate digest email HTML', () => {
      const notifications = [
        {
          title: 'Notification 1',
          message: 'First notification',
          createdAt: new Date()
        },
        {
          title: 'Notification 2', 
          message: 'Second notification',
          createdAt: new Date()
        }
      ];

      const html = emailService.generateDigestEmail(notifications);

      expect(html).toContain('Weekly Digest');
      expect(html).toContain('Notification 1');
      expect(html).toContain('Notification 2');
      expect(html).toContain('First notification');
      expect(html).toContain('Second notification');
    });

    it('should strip HTML from text content', () => {
      const html = '<p>Hello <strong>world</strong>!</p>';
      const service = emailService as any;
      const text = service.stripHtml(html);
      
      expect(text).toBe('Hello world!');
    });
  });
});

// Remove the duplicate import at the end