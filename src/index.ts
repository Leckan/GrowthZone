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
import JobScheduler from './lib/jobScheduler';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
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
app.use('/webhooks', webhookRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-community', (communityId: string) => {
    socket.join(`community-${communityId}`);
    console.log(`User ${socket.id} joined community ${communityId}`);
  });
  
  socket.on('leave-community', (communityId: string) => {
    socket.leave(`community-${communityId}`);
    console.log(`User ${socket.id} left community ${communityId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Store io instance for use in other modules
app.set('io', io);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
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
}

// Export both app and server for testing
export default app;
export { server, io };