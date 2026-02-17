import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

const Login = lazy(() => import('@/app/pages/Login'));
const Register = lazy(() => import('@/app/pages/Register'));
const ForgotPassword = lazy(() => import('@/app/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/app/pages/ResetPassword'));
const SelectPath = lazy(() => import('@/app/pages/SelectPath'));
const Home = lazy(() => import('@/app/pages/Home'));
const PlaceDetail = lazy(() => import('@/app/pages/PlaceDetail'));
const WriteReview = lazy(() => import('@/app/pages/WriteReview'));
const Profile = lazy(() => import('@/app/pages/Profile'));
const EditProfile = lazy(() => import('@/app/pages/EditProfile'));
const CheckInsList = lazy(() => import('@/app/pages/CheckInsList'));
const Favorites = lazy(() => import('@/app/pages/Favorites'));
const Groups = lazy(() => import('@/app/pages/Groups'));
const CreateGroup = lazy(() => import('@/app/pages/CreateGroup'));
const GroupDetail = lazy(() => import('@/app/pages/GroupDetail'));
const JoinGroup = lazy(() => import('@/app/pages/JoinGroup'));
const Settings = lazy(() => import('@/app/pages/Settings'));
const Notifications = lazy(() => import('@/app/pages/Notifications'));

/**
 * Wraps children in an ErrorBoundary keyed to the current pathname.
 * The key prop causes React to mount a fresh ErrorBoundary on every navigation,
 * so a crash on one route doesn't block access to other routes.
 */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">progress_activity</span>
    </div>
  );
}

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/profile" element={<Layout><Profile /></Layout>} />
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
      </Suspense>
    </RouteErrorBoundary>
  );
}
