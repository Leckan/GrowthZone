import { Request, Response, NextFunction } from 'express';

// Extend Request interface to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] as string || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add to request object
  req.requestId = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
};