import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SavedArticlesProvider } from './context/SavedArticlesContext';
import { SettingsProvider } from './context/SettingsContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import GuestRoute from './components/common/GuestRoute';
import NotForAdmin from './components/common/NotForAdmin';
import AnimatedGlobalWrapper from './components/common/AnimatedGlobalWrapper';
import { Toaster } from 'react-hot-toast';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AboutPage from './pages/AboutPage';

// Protected User Pages
import NewsFeedPage from './pages/NewsFeedPage';
import AnalyzePage from './pages/AnalyzePage';
import NewsDetailPage from './pages/NewsDetailPage';
import SearchResultsPage from './pages/SearchResultsPage';
import ComparisonPage from './pages/ComparisonPage';
import BiasReportPage from './pages/BiasReportPage';
import UserDashboardPage from './pages/UserDashboardPage';
import FeedbackPage from './pages/FeedbackPage';
import FeedbackHistoryPage from './pages/FeedbackHistoryPage';

// Protected Admin Pages
import AdminDashboardPage from './pages/AdminDashboardPage';
import SourceManagementPage from './pages/SourceManagementPage';
import UserManagementPage from './pages/UserManagementPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';
import AdminDataQualityPage from './pages/AdminDataQualityPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SessionWatcher from './components/common/SessionWatcher';
import ConnectionBanner from './components/common/ConnectionBanner';
import AdminSettingsPage from './pages/AdminSettingsPage';

function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthProvider>
          <SavedArticlesProvider>
            <Toaster position="top-right" toastOptions={{ style: { background: '#1E293B', color: '#fff', border: '1px solid #374151' } }} />
            <Router>
              <SessionWatcher />
              <ConnectionBanner />
              <AnimatedGlobalWrapper>
                <Routes>
                {/* Public Routes for visitors and readers (admins are sent to their dashboard) */}
                <Route path="/" element={<NotForAdmin><LandingPage /></NotForAdmin>} />
                <Route path="/about" element={<NotForAdmin><AboutPage /></NotForAdmin>} />

                {/* Only for visitors who are not logged in; logged-in users are sent to their home */}
                <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
                <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
                <Route path="/admin/login" element={<GuestRoute><AdminLoginPage /></GuestRoute>} />
                <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
                <Route path="/admin/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
                {/* opened from the e-mailed link; works whether or not someone is logged in */}
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                {/* Protected User Routes */}
                <Route element={<ProtectedRoute role="user" />}>
                  <Route path="/feed" element={<NewsFeedPage />} />
                  <Route path="/analyze" element={<AnalyzePage />} />
                  <Route path="/news/:id" element={<NewsDetailPage />} />
                  <Route path="/search" element={<SearchResultsPage />} />
                  <Route path="/compare" element={<ComparisonPage />} />
                  <Route path="/compare/:id1/:id2" element={<ComparisonPage />} />
                  <Route path="/report/:id" element={<BiasReportPage />} />
                  <Route path="/dashboard" element={<UserDashboardPage />} />
                  <Route path="/feedback" element={<FeedbackPage />} />
                  <Route path="/feedback/history" element={<FeedbackHistoryPage />} />
                </Route>

                {/* Protected Admin Routes */}
                <Route element={<ProtectedRoute role="admin" />}>
                  <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                  <Route path="/admin/sources" element={<SourceManagementPage />} />
                  <Route path="/admin/users" element={<UserManagementPage />} />
                  <Route path="/admin/feedback" element={<AdminFeedbackPage />} />
                  <Route path="/admin/quality" element={<AdminDataQualityPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                </Route>
                </Routes>
              </AnimatedGlobalWrapper>
            </Router>
          </SavedArticlesProvider>
        </AuthProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
