// API service for communicating with the backend
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp?: string;
  path?: string;
  method?: string;
  requestId?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  message?: string;
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ApiRequestError extends Error {
  public apiError: ApiError;
  public statusCode: number;

  constructor(apiError: ApiError, statusCode: number) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.apiError = apiError;
    this.statusCode = statusCode;
  }
}

class ApiService {
  private baseUrl: string;
  private token: string | null = null;
  private retryAttempts: number = 3;
  private retryDelay: number = 1000;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('authToken');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    // Add request ID for tracking
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    headers['X-Request-ID'] = requestId;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const responseData = await response.json();

      if (!response.ok) {
        const apiError: ApiError = {
          code: responseData.error?.code || 'UNKNOWN_ERROR',
          message: responseData.error?.message || responseData.message || `HTTP error! status: ${response.status}`,
          details: responseData.error?.details,
          timestamp: responseData.error?.timestamp,
          path: responseData.error?.path,
          method: responseData.error?.method,
          requestId: responseData.error?.requestId || requestId
        };

        // Handle specific error cases
        if (response.status === 401) {
          // Token expired or invalid - clear token and redirect to login
          if (apiError.code === 'TOKEN_EXPIRED' || apiError.code === 'INVALID_TOKEN') {
            this.clearToken();
            // Dispatch custom event for auth error
            window.dispatchEvent(new CustomEvent('auth-error', { detail: apiError }));
          }
        }

        // Retry logic for transient errors
        if (this.shouldRetry(response.status, apiError.code) && retryCount < this.retryAttempts) {
          await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
          return this.request<T>(endpoint, options, retryCount + 1);
        }

        throw new ApiRequestError(apiError, response.status);
      }

      return { data: responseData.data || responseData };
    } catch (error) {
      // Network errors or other fetch failures
      if (error instanceof ApiRequestError) {
        throw error;
      }

      // Retry network errors
      if (retryCount < this.retryAttempts && this.isNetworkError(error)) {
        await this.delay(this.retryDelay * Math.pow(2, retryCount));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      const networkError: ApiError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error occurred',
        requestId
      };

      throw new NetworkError(networkError.message);
    }
  }

  private shouldRetry(statusCode: number, errorCode: string): boolean {
    // Retry on server errors and specific client errors
    const retryableStatusCodes = [500, 502, 503, 504, 408, 429];
    const retryableErrorCodes = ['SERVICE_UNAVAILABLE', 'RATE_LIMIT_EXCEEDED'];
    
    return retryableStatusCodes.includes(statusCode) || retryableErrorCodes.includes(errorCode);
  }

  private isNetworkError(error: any): boolean {
    return error instanceof TypeError && error.message.includes('fetch');
  }

  // Wrapper for handling API responses with user-friendly error messages
  private async handleApiCall<T>(apiCall: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
    try {
      return await apiCall();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return {
          error: {
            ...error.apiError,
            message: this.getUserFriendlyMessage(error.apiError)
          }
        };
      }

      if (error instanceof NetworkError) {
        return {
          error: {
            code: 'NETWORK_ERROR',
            message: 'Unable to connect to the server. Please check your internet connection and try again.'
          }
        };
      }

      return {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred. Please try again.'
        }
      };
    }
  }

  private getUserFriendlyMessage(apiError: ApiError): string {
    const friendlyMessages: Record<string, string> = {
      'AUTHENTICATION_REQUIRED': 'Please log in to continue.',
      'TOKEN_EXPIRED': 'Your session has expired. Please log in again.',
      'INVALID_TOKEN': 'Your session is invalid. Please log in again.',
      'INSUFFICIENT_PERMISSIONS': 'You don\'t have permission to perform this action.',
      'VALIDATION_ERROR': 'Please check your input and try again.',
      'DUPLICATE_RECORD': 'This information is already in use. Please try different values.',
      'RECORD_NOT_FOUND': 'The requested item could not be found.',
      'PAYMENT_REQUIRED': 'Payment is required to access this content.',
      'CARD_DECLINED': 'Your payment method was declined. Please try a different card.',
      'SUBSCRIPTION_EXPIRED': 'Your subscription has expired. Please renew to continue.',
      'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment and try again.',
      'FILE_TOO_LARGE': 'The file you\'re trying to upload is too large.',
      'INVALID_FILE_TYPE': 'Please upload a supported file type.',
      'SERVICE_UNAVAILABLE': 'The service is temporarily unavailable. Please try again later.',
      'DATABASE_ERROR': 'A database error occurred. Please try again.',
      'NETWORK_ERROR': 'Unable to connect to the server. Please check your connection.'
    };

    return friendlyMessages[apiError.code] || apiError.message;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.handleApiCall(() => 
      this.request<{ tokens: { accessToken: string; refreshToken: string }; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    );
  }

  async register(userData: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }) {
    return this.handleApiCall(() =>
      this.request<{ tokens: { accessToken: string; refreshToken: string }; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      })
    );
  }

  async logout() {
    return this.handleApiCall(() =>
      this.request('/auth/logout', {
        method: 'POST',
      })
    );
  }

  // User endpoints
  async getProfile() {
    return this.handleApiCall(() =>
      this.request<any>('/users/profile')
    );
  }

  async updateProfile(profileData: any) {
    return this.handleApiCall(() =>
      this.request<any>('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData),
      })
    );
  }

  // Communities endpoints
  async getCommunities() {
    return this.handleApiCall(() =>
      this.request<{ communities: any[]; total: number; hasMore: boolean }>('/communities')
    );
  }

  async getCommunity(id: string) {
    return this.handleApiCall(() =>
      this.request<any>(`/communities/${id}`)
    );
  }

  async createCommunity(communityData: any) {
    return this.handleApiCall(() =>
      this.request<any>('/communities', {
        method: 'POST',
        body: JSON.stringify(communityData),
      })
    );
  }

  async updateCommunity(id: string, communityData: any) {
    return this.handleApiCall(() =>
      this.request<any>(`/communities/${id}`, {
        method: 'PUT',
        body: JSON.stringify(communityData),
      })
    );
  }

  async joinCommunity(id: string) {
    return this.handleApiCall(() =>
      this.request<any>(`/communities/${id}/join`, {
        method: 'POST',
      })
    );
  }

  async leaveCommunity(id: string) {
    return this.handleApiCall(() =>
      this.request<any>(`/communities/${id}/leave`, {
        method: 'DELETE',
      })
    );
  }
}

export const apiService = new ApiService();
export default apiService;