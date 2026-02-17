import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import Login from '@/app/pages/Login';
import Register from '@/app/pages/Register';
import ForgotPassword from '@/app/pages/ForgotPassword';
import ResetPassword from '@/app/pages/ResetPassword';
import SelectPath from '@/app/pages/SelectPath';
import Home from '@/app/pages/Home';
import PlaceDetail from '@/app/pages/PlaceDetail';
import WriteReview from '@/app/pages/WriteReview';
import Profile from '@/app/pages/Profile';
import EditProfile from '@/app/pages/EditProfile';
import CheckInsList from '@/app/pages/CheckInsList';
import Favorites from '@/app/pages/Favorites';
import Groups from '@/app/pages/Groups';
import CreateGroup from '@/app/pages/CreateGroup';
import GroupDetail from '@/app/pages/GroupDetail';
import JoinGroup from '@/app/pages/JoinGroup';
import Settings from '@/app/pages/Settings';
import Notifications from '@/app/pages/Notifications';

/**
 * Wraps children in an ErrorBoundary keyed to the current pathname.
 * The key prop causes React to mount a fresh ErrorBoundary on every navigation,
 * so a crash on one route doesn't block access to other routes.
 */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/select-path" element={<ProtectedRoute><SelectPath /></ProtectedRoute>} />
      <Route path="/home" element={<Layout><Home /></Layout>} />
      <Route path="/places/:placeCode" element={<Layout><PlaceDetail /></Layout>} />
      <Route path="/places/:placeCode/review" element={<Layout><ProtectedRoute><WriteReview /></ProtectedRoute></Layout>} />
      <Route path="/profile" element={<Layout><ProtectedRoute><Profile /></ProtectedRoute></Layout>} />
      <Route path="/profile/edit" element={<Layout><ProtectedRoute><EditProfile /></ProtectedRoute></Layout>} />
      <Route path="/profile/check-ins" element={<Layout><ProtectedRoute><CheckInsList /></ProtectedRoute></Layout>} />
      <Route path="/favorites" element={<Layout><ProtectedRoute><Favorites /></ProtectedRoute></Layout>} />
      <Route path="/groups" element={<Layout><ProtectedRoute><Groups /></ProtectedRoute></Layout>} />
      <Route path="/groups/new" element={<Layout><ProtectedRoute><CreateGroup /></ProtectedRoute></Layout>} />
      <Route path="/groups/:groupCode" element={<Layout><ProtectedRoute><GroupDetail /></ProtectedRoute></Layout>} />
      <Route path="/join" element={<Layout><ProtectedRoute><JoinGroup /></ProtectedRoute></Layout>} />
      <Route path="/settings" element={<Layout><ProtectedRoute><Settings /></ProtectedRoute></Layout>} />
      <Route path="/notifications" element={<Layout><ProtectedRoute><Notifications /></ProtectedRoute></Layout>} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    </RouteErrorBoundary>
  );
}
