import { z } from 'zod';

// User registration validation schema
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required')
    .max(255, 'Email must be less than 255 characters'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must be less than 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters long')
    .max(50, 'Username must be less than 50 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    ),
  
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(100, 'Display name must be less than 100 characters')
    .optional()
});

// User login validation schema
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required'),
  
  password: z
    .string()
    .min(1, 'Password is required')
});

// Token refresh validation schema
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
});

// Profile update validation schema
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(100, 'Display name must be less than 100 characters')
    .optional(),
  
  bio: z
    .string()
    .max(500, 'Bio must be less than 500 characters')
    .optional(),
  
  avatarUrl: z
    .string()
    .url('Invalid avatar URL format')
    .max(500, 'Avatar URL must be less than 500 characters')
    .optional()
});

// Activity query validation schema
export const activityQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(Number)
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional()
    .or(z.number().min(1).max(100).optional()),
  
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a number')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be non-negative')
    .optional()
    .or(z.number().min(0).optional()),
  
  type: z
    .enum(['posts', 'comments', 'progress', 'points'])
    .optional()
});

// Community creation validation schema
export const createCommunitySchema = z.object({
  name: z
    .string()
    .min(1, 'Community name is required')
    .max(100, 'Community name must be less than 100 characters'),
  
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters long')
    .max(100, 'Slug must be less than 100 characters')
    .regex(
      /^[a-z0-9-]+$/,
      'Slug can only contain lowercase letters, numbers, and hyphens'
    ),
  
  isPublic: z
    .boolean()
    .optional()
    .default(true),
  
  requiresApproval: z
    .boolean()
    .optional()
    .default(false),
  
  priceMonthly: z
    .number()
    .min(0, 'Monthly price must be non-negative')
    .max(9999.99, 'Monthly price must be less than $10,000')
    .optional(),
  
  priceYearly: z
    .number()
    .min(0, 'Yearly price must be non-negative')
    .max(99999.99, 'Yearly price must be less than $100,000')
    .optional()
});

// Community update validation schema
export const updateCommunitySchema = z.object({
  name: z
    .string()
    .min(1, 'Community name is required')
    .max(100, 'Community name must be less than 100 characters')
    .optional(),
  
  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  
  isPublic: z
    .boolean()
    .optional(),
  
  requiresApproval: z
    .boolean()
    .optional(),
  
  priceMonthly: z
    .number()
    .min(0, 'Monthly price must be non-negative')
    .max(9999.99, 'Monthly price must be less than $10,000')
    .optional(),
  
  priceYearly: z
    .number()
    .min(0, 'Yearly price must be non-negative')
    .max(99999.99, 'Yearly price must be less than $100,000')
    .optional()
});

// Community query validation schema
export const communityQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(Number)
    .refine(val => val > 0 && val <= 50, 'Limit must be between 1 and 50')
    .optional()
    .or(z.number().min(1).max(50).optional()),
  
  offset: z
    .string()
    .regex(/^\d+$/, 'Offset must be a number')
    .transform(Number)
    .refine(val => val >= 0, 'Offset must be non-negative')
    .optional()
    .or(z.number().min(0).optional()),
  
  search: z
    .string()
    .max(100, 'Search term must be less than 100 characters')
    .optional(),
  
  isPublic: z
    .string()
    .transform(val => val === 'true')
    .optional()
    .or(z.boolean().optional())
});

// Member management validation schemas
export const membershipRequestSchema = z.object({
  communityId: z
    .string()
    .min(1, 'Community ID is required')
});

export const memberRoleUpdateSchema = z.object({
  role: z
    .enum(['member', 'moderator', 'admin'], {
      errorMap: () => ({ message: 'Role must be member, moderator, or admin' })
    })
});

export const memberStatusUpdateSchema = z.object({
  status: z
    .enum(['pending', 'active', 'suspended'], {
      errorMap: () => ({ message: 'Status must be pending, active, or suspended' })
    })
});

// Validation helper function
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
} {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string[]> = {};
      
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path].push(err.message);
      });
      
      return { success: false, errors };
    }
    
    return { 
      success: false, 
      errors: { general: ['Validation failed'] } 
    };
  }
}