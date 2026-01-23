import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigation } from './components/Navigation';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NotificationToast } from './components/NotificationToast';
import { PointsNotification } from './components/PointsNotification';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { CreateCommunityPage } from './pages/CreateCommunityPage';
import { CommunityDetailPage } from './pages/CommunityDetailPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { FeedPage } from './pages/FeedPage';
import { useGlobalErrorHandler } from './hooks/useGlobalErrorHandler';
import './App.css';

// Home page component
const Home = () => (
  <div className="min-h-screen bg-gray-50">
    <Navigation />
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Community Learning Platform</h1>
        <p className="text-lg text-gray-600 mb-8">Welcome to your learning community</p>
        <div className="space-x-4">
          <a
            href="/login"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Get Started
          </a>
          <a
            href="/communities"
            className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Browse Communities
          </a>
        </div>
      </div>
    </div>
  </div>
);

// Main App component with error handling
const AppContent = () => {
  // Set up global error handling
  useGlobalErrorHandler({
    onAuthError: (error) => {
      console.warn('Authentication error detected:', error.message);
      // The API service already handles token clearing and redirects
    },
    onNetworkError: (error) => {
      console.error('Network error detected:', error.message);
      // Show user-friendly network error notification
      const event = new CustomEvent('show-error-notification', {
        detail: { 
          message: 'Connection problem detected. Please check your internet connection.',
          details: error.message 
        }
      });
      window.dispatchEvent(event);
    },
    onUnhandledError: (error) => {
      console.error('Unhandled error detected:', error);
      // In production, you might want to send this to an error reporting service
      if (process.env.NODE_ENV === 'production') {
        // Example: Send to error reporting service
        // errorReportingService.captureException(error);
      }
    }
  });

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/communities/:id" element={<CommunityDetailPage />} />
        <Route path="/communities/:communityId/feed" element={<FeedPage />} />
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route
          path="/communities/create"
          element={
            <ProtectedRoute>
              <CreateCommunityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
      </Routes>
      
      {/* Global Real-time Components */}
      <NotificationToast />
      <PointsNotification />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log error for debugging
        console.error('React Error Boundary caught error:', error, errorInfo);
        
        // In production, send to error reporting service
        if (process.env.NODE_ENV === 'production') {
          // Example: Send to error reporting service
          // errorReportingService.captureException(error, { extra: errorInfo });
        }
      }}
    >
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <Router>
              <AppContent />
            </Router>
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
