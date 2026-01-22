// Core types for the Community Learning Platform

export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  totalPoints: number;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Community {
  id: string;
  name: string;
  description?: string;
  slug: string;
  creatorId: string;
  isPublic: boolean;
  requiresApproval: boolean;
  priceMonthly?: number;
  priceYearly?: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityMembership {
  id: string;
  userId: string;
  communityId: string;
  role: 'member' | 'moderator' | 'admin';
  status: 'pending' | 'active' | 'suspended';
  joinedAt: string;
}

export interface Course {
  id: string;
  communityId: string;
  title: string;
  description?: string;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  content?: string;
  contentType: 'text' | 'video' | 'file';
  videoUrl?: string;
  fileUrl?: string;
  isFree: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  communityId: string;
  authorId: string;
  title?: string;
  content: string;
  postType: 'discussion' | 'announcement';
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  author?: User;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  parentId?: string;
  content: string;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author?: User;
  replies?: Comment[];
}

export interface UserProgress {
  id: string;
  userId: string;
  lessonId: string;
  completedAt?: string;
  timeSpent: number;
}

export interface PointsTransaction {
  id: string;
  userId: string;
  communityId: string;
  points: number;
  reason: string;
  referenceId?: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  communityId: string;
  stripeSubscriptionId?: string;
  status: 'active' | 'canceled' | 'past_due';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// API Response types
export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form types
export interface CommunityFormData {
  name: string;
  description?: string;
  isPublic: boolean;
  requiresApproval: boolean;
  priceMonthly?: number;
  priceYearly?: number;
}

export interface CourseFormData {
  title: string;
  description?: string;
  isPublished: boolean;
}

export interface LessonFormData {
  title: string;
  content?: string;
  contentType: 'text' | 'video' | 'file';
  videoUrl?: string;
  fileUrl?: string;
  isFree: boolean;
}

export interface PostFormData {
  title?: string;
  content: string;
  postType: 'discussion' | 'announcement';
}