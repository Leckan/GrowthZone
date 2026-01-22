import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err };
  error.message = err.message;

  // Log error with context
  console.error(`[${new Date().toISOString()}] Error in ${req.method} ${req.path}:`, {
    error: err.message,
    stack: err.stack,
    userId: (req as any).user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';
  let details = error.details || null;

  // Authentication Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired. Please log in again.';
    code = 'TOKEN_EXPIRED';
  }

  // Authorization Errors
  if (err.message.includes('Insufficient permissions')) {
    statusCode = 403;
    code = 'INSUFFICIENT_PERMISSIONS';
  }

  if (err.message.includes('Payment required')) {
    statusCode = 402;
    code = 'PAYMENT_REQUIRED';
  }

  // Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'The provided data is invalid';
  }

  // Prisma Database Errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    statusCode = 400;
    code = 'DATABASE_ERROR';
    
    switch (prismaError.code) {
      case 'P2002':
        message = 'A record with this information already exists';
        code = 'DUPLICATE_RECORD';
        details = { field: prismaError.meta?.target };
        break;
      case 'P2025':
        message = 'The requested record was not found';
        code = 'RECORD_NOT_FOUND';
        statusCode = 404;
        break;
      case 'P2003':
        message = 'Invalid reference to related record';
        code = 'INVALID_REFERENCE';
        break;
      default:
        message = 'Database operation failed';
    }
  }

  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid data provided';
    code = 'INVALID_DATA';
  }

  // Payment Processing Errors
  if (err.message.includes('card_declined')) {
    statusCode = 402;
    message = 'Your payment method was declined. Please try a different card.';
    code = 'CARD_DECLINED';
  }

  if (err.message.includes('subscription_expired')) {
    statusCode = 402;
    message = 'Your subscription has expired. Please renew to continue access.';
    code = 'SUBSCRIPTION_EXPIRED';
  }

  // Rate Limiting Errors
  if (err.message.includes('Too many requests')) {
    statusCode = 429;
    message = 'Too many requests. Please try again later.';
    code = 'RATE_LIMIT_EXCEEDED';
  }

  // File Upload Errors
  if (err.message.includes('File too large')) {
    statusCode = 413;
    message = 'The uploaded file is too large. Maximum size is 10MB.';
    code = 'FILE_TOO_LARGE';
  }

  if (err.message.includes('Invalid file type')) {
    statusCode = 400;
    message = 'Invalid file type. Please upload a supported format.';
    code = 'INVALID_FILE_TYPE';
  }

  // Network/External Service Errors
  if (err.message.includes('Service unavailable')) {
    statusCode = 503;
    message = 'External service is temporarily unavailable. Please try again later.';
    code = 'SERVICE_UNAVAILABLE';
  }

  // Construct error response
  const errorResponse: any = {
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    }
  };

  // Add details if available
  if (details) {
    errorResponse.error.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Add request ID for tracking
  if (req.requestId) {
    errorResponse.error.requestId = req.requestId;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Error creation helpers
export const createError = (message: string, statusCode: number, code?: string, details?: any): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  error.code = code;
  error.details = details;
  return error;
};

export const createValidationError = (message: string, validationErrors: ValidationError[]): AppError => {
  const error = createError(message, 400, 'VALIDATION_ERROR', { validationErrors });
  error.name = 'ValidationError';
  return error;
};

export const createAuthError = (message: string = 'Authentication required'): AppError => {
  return createError(message, 401, 'AUTHENTICATION_REQUIRED');
};

export const createAuthorizationError = (message: string = 'Insufficient permissions'): AppError => {
  return createError(message, 403, 'INSUFFICIENT_PERMISSIONS');
};

export const createNotFoundError = (resource: string = 'Resource'): AppError => {
  return createError(`${resource} not found`, 404, 'RESOURCE_NOT_FOUND');
};

export const createPaymentError = (message: string): AppError => {
  return createError(message, 402, 'PAYMENT_REQUIRED');
};