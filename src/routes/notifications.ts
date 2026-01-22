import express from 'express';
import { notificationService, NotificationType } from '../lib/notificationService';
import { authenticateToken } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get user notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = await notificationService.getUserNotifications(userId, {
      limit,
      offset,
      unreadOnly,
    });

    const unreadCount = await notificationService.getUnreadCount(userId);

    res.json({
      notifications,
      unreadCount,
      hasMore: notifications.length === limit,
    });
  } catch (error) {
    console.error('Failed to get notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Get unread count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user!.id;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    console.error('Failed to get unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const success = await notificationService.markAsRead(notificationId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Notification not found or already read' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/read-all', async (req, res) => {
  try {
    const userId = req.user!.id;
    const count = await notificationService.markAllAsRead(userId);
    res.json({ markedCount: count });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const success = await notificationService.deleteNotification(notificationId, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete notification:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user!.id;
    const preferences = await notificationService.getUserPreferences(userId);
    res.json(preferences);
  } catch (error) {
    console.error('Failed to get notification preferences:', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

// Update notification preferences
const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  postLikes: z.boolean().optional(),
  commentReplies: z.boolean().optional(),
  courseUpdates: z.boolean().optional(),
  communityAnnouncements: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});

router.patch('/preferences', async (req, res) => {
  try {
    const userId = req.user!.id;
    const validation = updatePreferencesSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid preferences data',
        details: validation.error.errors 
      });
    }

    const preferences = await notificationService.updateUserPreferences(
      userId,
      validation.data
    );

    return res.json(preferences);
  } catch (error) {
    console.error('Failed to update notification preferences:', error);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// Send test notification (for development/testing)
if (process.env.NODE_ENV !== 'production') {
  const testNotificationSchema = z.object({
    type: z.string(),
    title: z.string(),
    message: z.string(),
    data: z.record(z.any()).optional(),
    sendEmail: z.boolean().optional(),
  });

  router.post('/test', async (req, res) => {
    try {
      const userId = req.user!.id;
      const validation = testNotificationSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid notification data',
          details: validation.error.errors 
        });
      }

      const notificationId = await notificationService.createNotification({
        userId,
        type: validation.data.type as NotificationType,
        title: validation.data.title,
        message: validation.data.message,
        data: validation.data.data,
        sendEmail: validation.data.sendEmail,
      });

      return res.json({ notificationId, success: true });
    } catch (error) {
      console.error('Failed to create test notification:', error);
      return res.status(500).json({ error: 'Failed to create test notification' });
    }
  });
}

export default router;