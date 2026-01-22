import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { registerServiceWorker, performanceMonitor, optimizeFontLoading } from './utils/performance';

// Initialize performance optimizations
performanceMonitor.startTiming('app_initialization');

// Optimize font loading
optimizeFontLoading();

// Register service worker for caching and offline support
registerServiceWorker();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Use concurrent features for better performance
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Performance monitoring
performanceMonitor.endTiming('app_initialization');

// Report web vitals with custom analytics
reportWebVitals((metric) => {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Web Vital:', metric);
  }
  
  // In production, you could send to analytics service
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to analytics
    // analytics.track('web_vital', metric);
  }
});

// Report performance metrics after app loads
window.addEventListener('load', () => {
  performanceMonitor.reportWebVitals();
  
  // Log performance metrics in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Performance Metrics:', performanceMonitor.getAllMetrics());
  }
});
