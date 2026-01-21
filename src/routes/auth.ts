import { Router, Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import prisma from '../lib/prisma';
import { 
  hashPassword, 
  verifyPassword, 
  generateTokenPair, 
  verifyRefreshToken 
} from '../lib/auth';
import { 
  registerSchema, 
  loginSchema, 
  refreshTokenSchema, 
  validateRequest 
} from '../lib/validation';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user account
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(registerSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const { email, password, username, displayName } = validation.data!;

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create user in database
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        username,
        displayName: displayName || username
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        emailVerified: true,
        createdAt: true
      }
    });

    // Generate JWT tokens - create a complete User object for token generation
    const completeUser = {
      ...user,
      passwordHash,
      bio: null,
      avatarUrl: null,
      totalPoints: 0,
      updatedAt: user.createdAt
    };
    const tokens = generateTokenPair(completeUser);

    res.status(201).json({
      message: 'User registered successfully',
      user,
      tokens
    });
  } catch (error) {
    // Handle unique constraint violations
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = error.meta?.target as string[];
        if (target?.includes('email')) {
          res.status(409).json({
            error: 'Registration failed',
            message: 'Email address is already registered'
          });
          return;
        }
        if (target?.includes('username')) {
          res.status(409).json({
            error: 'Registration failed',
            message: 'Username is already taken'
          });
          return;
        }
      }
    }

    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register user'
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate user and return JWT tokens
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(loginSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const { email, password } = validation.data!;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
      return;
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
      return;
    }

    // Generate JWT tokens
    const tokens = generateTokenPair(user);

    // Return user data (excluding password hash)
    const { passwordHash, ...userWithoutPassword } = user;

    res.status(200).json({
      message: 'Login successful',
      user: userWithoutPassword,
      tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to authenticate user'
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(refreshTokenSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
      return;
    }

    const { refreshToken } = validation.data!;

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Find user to ensure they still exist
    const user = await prisma.user.findUnique({
      where: { id: payload.userId }
    });

    if (!user) {
      res.status(401).json({
        error: 'Token refresh failed',
        message: 'User not found'
      });
      return;
    }

    // Generate new token pair
    const tokens = generateTokenPair(user);

    res.status(200).json({
      message: 'Tokens refreshed successfully',
      tokens
    });
  } catch (error) {
    res.status(401).json({
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Invalid refresh token'
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', (req: Request, res: Response): void => {
  // Since we're using stateless JWT tokens, logout is handled client-side
  // by removing the tokens from storage. This endpoint exists for consistency
  // and could be extended to maintain a token blacklist if needed.
  
  res.status(200).json({
    message: 'Logout successful'
  });
});

export default router;