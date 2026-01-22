#!/usr/bin/env ts-node

/**
 * Weekly Digest Cron Job Script
 * 
 * This script can be run as a cron job to send weekly digest emails.
 * 
 * Usage:
 * - Run manually: npx ts-node src/scripts/send-weekly-digest.ts
 * - Add to crontab: 0 9 * * 0 cd /path/to/app && npx ts-node src/scripts/send-weekly-digest.ts
 *   (Runs every Sunday at 9 AM)
 */

import dotenv from 'dotenv';
import prisma from '../lib/prisma';
import { notificationService } from '../lib/notificationService';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('Starting weekly digest job...');
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Time: ${new Date().toISOString()}`);

    // Get all users who have weekly digest enabled
    const users = await prisma.user.findMany({
      where: {
        notificationPreferences: {
          emailEnabled: true,
          weeklyDigest: true
        }
      },
      select: { 
        id: true,
        email: true,
        displayName: true 
      }
    });

    console.log(`Found ${users.length} users with weekly digest enabled`);

    if (users.length === 0) {
      console.log('No users found for weekly digest. Exiting.');
      return;
    }

    const userIds = users.map((user: any) => user.id);
    const result = await notificationService.sendBulkDigests(userIds);
    
    console.log(`Weekly digest job completed:`);
    console.log(`- Successfully sent: ${result.sent}`);
    console.log(`- Failed to send: ${result.failed}`);
    console.log(`- Total processed: ${users.length}`);

    if (result.failed > 0) {
      console.warn(`Warning: ${result.failed} digest emails failed to send`);
      process.exit(1);
    }

  } catch (error) {
    console.error('Weekly digest job failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main as sendWeeklyDigest };