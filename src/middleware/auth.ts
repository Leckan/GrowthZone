import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader, JwtPayload } from '../lib/auth';
import prisma from '../lib/prisma';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        displayName?: string | null;
        emailVerified: boolean;
      };
    }
  }
}

/**
 * Middleware to authenticate JWT tokens
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
      return;
    }

    // Verify the token
    const payload: JwtPayload = verifyAccessToken(token);
    
    // Fetch user from database to ensure they still exist and get latest data
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        emailVerified: true
      }
    });

    if (!user) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found'
      });
      return;
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Invalid token'
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      // No token provided, continue without authentication
      next();
      return;
    }

    // Verify the token
    const payload: JwtPayload = verifyAccessToken(token);
    
    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        emailVerified: true
      }
    });

    if (user) {
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Token is invalid, but we continue without authentication
    next();
  }
}

/**
 * Middleware to require email verification
 */
export function requireEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in first'
    });
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address before accessing this resource'
    });
    return;
  }

  next();
}