import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Load environment variables
dotenv.config();

// Import routes and middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestIdMiddleware } from './middleware/requestId';
import { redisService } from './lib/redis';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import communityRoutes from './routes/communities';
import courseRoutes from './routes/courses';
import progressRoutes from './routes/progress';
import postRoutes from './routes/posts';
import pointsRoutes from './routes/points';
import paymentRoutes from './routes/payments';
import webhookRoutes from './routes/webhooks';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import recommendationRoutes from './routes/recommendations';
import JobScheduler from './lib/jobScheduler';
import { SocketService } from './lib/socketService';
import { setSocketService } from './lib/pointsService';
import { setNotificationSocketService } from './lib/notificationService';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Initialize Redis connection
async function initializeRedis() {
  try {
    await redisService.connect();
    console.log('✅ Redis connected successfully');
  } catch (error) {
    console.warn('⚠️  Redis connection failed, continuing without cache:', error);
  }
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Request ID middleware (before other middleware)
app.use(requestIdMiddleware);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    requestId: req.requestId,
    redis: redisService.isReady() ? 'connected' : 'disconnected'
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/communities', communityRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/webhooks', webhookRoutes);

// WebSocket service initialization
const socketService = new SocketService(io);

// Set socket service for other modules
setSocketService(socketService);
setNotificationSocketService(socketService);

// Store both io instance and socketService for use in other modules
app.set('io', io);
app.set('socketService', socketService);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Initialize Redis and start server
  initializeRedis().then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      
      // Start background jobs in development for testing
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Starting notification jobs...');
        // Don't auto-start in development, let users trigger manually
      }
    });
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisService.disconnect();
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await redisService.disconnect();
  server.close(() => {
    console.log('Process terminated');
  });
});

// Export both app and server for testing
export default app;
export { server, io };