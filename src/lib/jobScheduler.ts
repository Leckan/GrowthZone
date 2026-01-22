import { notificationService } from './notificationService';
import prisma from './prisma';

export class JobScheduler {
  private static intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start the weekly digest job
   */
  static startWeeklyDigestJob() {
    // Run every Sunday at 9 AM (in production, use a proper cron job)
    const interval = setInterval(async () => {
      await this.runWeeklyDigestJob();
    }, 7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds

    this.intervals.set('weeklyDigest', interval);
    console.log('Weekly digest job started');
  }

  /**
   * Stop all scheduled jobs
   */
  static stopAllJobs() {
    this.intervals.forEach((interval, name) => {
      clearInterval(interval);
      console.log(`Stopped job: ${name}`);
    });
    this.intervals.clear();
  }

  /**
   * Run the weekly digest job manually
   */
  static async runWeeklyDigestJob() {
    try {
      console.log('Starting weekly digest job...');

      // Get all users who have weekly digest enabled
      const users = await prisma.user.findMany({
        where: {
          notificationPreferences: {
            emailEnabled: true,
            weeklyDigest: true
          }
        },
        select: { id: true }
      });

      const userIds = users.map((user: any) => user.id);
      
      if (userIds.length === 0) {
        console.log('No users found for weekly digest');
        return;
      }

      const result = await notificationService.sendBulkDigests(userIds);
      
      console.log(`Weekly digest job completed: ${result.sent} sent, ${result.failed} failed`);
    } catch (error) {
      console.error('Weekly digest job failed:', error);
    }
  }

  /**
   * Send a test digest to a specific user
   */
  static async sendTestDigest(userId: string) {
    try {
      const success = await notificationService.sendWeeklyDigest(userId);
      return success;
    } catch (error) {
      console.error('Failed to send test digest:', error);
      return false;
    }
  }
}

// Auto-start jobs in production
if (process.env.NODE_ENV === 'production') {
  JobScheduler.startWeeklyDigestJob();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  JobScheduler.stopAllJobs();
});

process.on('SIGINT', () => {
  JobScheduler.stopAllJobs();
});

export default JobScheduler;