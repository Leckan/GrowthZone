import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

export default async function globalSetup() {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Set test database URL if not already set
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/community_learning_platform_test';
  }

  console.log('Setting up test database...');
  
  try {
    // Create test database if it doesn't exist
    const prisma = new PrismaClient();
    
    // Test connection
    await prisma.$connect();
    
    // Run migrations to ensure schema is up to date
    execSync('npx prisma migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
    
    console.log('Test database setup complete');
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}