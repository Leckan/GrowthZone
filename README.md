# Community Learning Platform

A modern web application that combines course delivery, community engagement, and monetization features into a unified experience. Built with TypeScript, Express.js, PostgreSQL, and React.

## Features

- 🔐 **Authentication & User Management** - JWT-based auth with user profiles
- 🏘️ **Community Management** - Create and manage learning communities
- 📚 **Course Content** - Structured educational content delivery
- 💬 **Discussions** - Community feed with threaded discussions
- 🎮 **Gamification** - Points system and leaderboards
- 💳 **Payments** - Stripe integration for subscriptions
- 🔍 **Search & Discovery** - Find communities and content
- 📱 **Mobile Responsive** - Works on all devices
- ⚡ **Real-time** - WebSocket support for live updates

## Tech Stack

### Backend
- **Node.js** with **Express.js** framework
- **TypeScript** for type safety
- **PostgreSQL** database with **Prisma** ORM
- **JWT** for authentication
- **Socket.io** for real-time features
- **Jest** and **fast-check** for testing

### Frontend (Coming Soon)
- **React 18** with **TypeScript**
- **Tailwind CSS** for styling
- **React Query** for state management

### External Services
- **Stripe** for payment processing
- **SendGrid** for email delivery
- **AWS S3** for file storage

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd community-learning-platform
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication (Coming Soon)
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - User logout

### Users (Coming Soon)
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update user profile
- `GET /api/v1/users/activity` - Get user activity

### Communities (Coming Soon)
- `GET /api/v1/communities` - List communities
- `POST /api/v1/communities` - Create community
- `GET /api/v1/communities/:id` - Get community details
- `PUT /api/v1/communities/:id` - Update community
- `POST /api/v1/communities/:id/join` - Join community
- `DELETE /api/v1/communities/:id/leave` - Leave community

## Database Schema

The application uses PostgreSQL with Prisma ORM. Key entities include:

- **Users** - User accounts and profiles
- **Communities** - Learning communities
- **Courses** - Structured course content
- **Lessons** - Individual content units
- **Posts** - Community discussions
- **Comments** - Threaded discussion replies
- **Subscriptions** - Payment and access management

## Testing

The project uses Jest for unit testing and fast-check for property-based testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details