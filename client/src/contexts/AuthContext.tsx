import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User, AuthState } from '../types';
import apiService from '../services/api';

// Auth actions
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean };

// Auth context type
interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  register: (userData: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }) => Promise<boolean>;
  logout: () => void;
  updateProfile: (profileData: Partial<User>) => Promise<boolean>;
}

// Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        apiService.setToken(token);
        const response = await apiService.getProfile();
        if (response.data) {
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: { user: response.data, token },
          });
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('authToken');
          apiService.clearToken();
          dispatch({ type: 'LOGIN_FAILURE' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    dispatch({ type: 'LOGIN_START' });
    
    try {
      const response = await apiService.login(email, password);
      if (response.data) {
        const { tokens, user } = response.data;
        apiService.setToken(tokens.accessToken);
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token: tokens.accessToken } });
        return true;
      } else {
        dispatch({ type: 'LOGIN_FAILURE' });
        // If there's an error in the response, throw it so the form can handle it
        if (response.error) {
          const error = new Error(response.error.message || 'Login failed');
          (error as any).response = { data: response.error };
          throw error;
        }
        return false;
      }
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error; // Re-throw the error so the form can handle it
    }
  };

  const register = async (userData: {
    email: string;
    password: string;
    username: string;
    displayName?: string;
  }): Promise<boolean> => {
    dispatch({ type: 'LOGIN_START' });
    
    try {
      const response = await apiService.register(userData);
      if (response.data) {
        const { tokens, user } = response.data;
        apiService.setToken(tokens.accessToken);
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token: tokens.accessToken } });
        return true;
      } else {
        dispatch({ type: 'LOGIN_FAILURE' });
        // If there's an error in the response, throw it so the form can handle it
        if (response.error) {
          const error = new Error(response.error.message || 'Registration failed');
          (error as any).response = { data: response.error };
          throw error;
        }
        return false;
      }
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error; // Re-throw the error so the form can handle it
    }
  };

  const logout = async () => {
    await apiService.logout();
    apiService.clearToken();
    dispatch({ type: 'LOGOUT' });
  };

  const updateProfile = async (profileData: Partial<User>): Promise<boolean> => {
    const response = await apiService.updateProfile(profileData);
    if (response.data) {
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: response.data, token: state.token! },
      });
      return true;
    }
    return false;
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}