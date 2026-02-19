import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

const CHUNK_RELOAD_KEY = 'chunkLoadError';

/**
 * Wraps React.lazy with a one-shot reload guard for stale-deployment chunk errors.
 *
 * When a dynamic import fails (e.g. "Failed to fetch dynamically imported module"),
 * it means the browser has a cached index.html that references old content-hashed
 * chunk filenames that no longer exist after a new deploy.  On the first failure we
 * set a sessionStorage flag and hard-reload — the fresh index.html will reference
 * the current chunk hashes and the import will succeed.  If the import still fails
 * after a reload, the flag is already set so we throw the error and let the
 * ErrorBoundary handle it normally.
 */
function lazyWithReload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: Error) => {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // hang until reload navigates away
      }
      throw err;
    }),
  );
}

const Login = lazyWithReload(() => import('@/app/pages/Login'));
const Register = lazyWithReload(() => import('@/app/pages/Register'));
const ForgotPassword = lazyWithReload(() => import('@/app/pages/ForgotPassword'));
const ResetPassword = lazyWithReload(() => import('@/app/pages/ResetPassword'));
const Home = lazyWithReload(() => import('@/app/pages/Home'));
const PlaceDetail = lazyWithReload(() => import('@/app/pages/PlaceDetail'));
const WriteReview = lazyWithReload(() => import('@/app/pages/WriteReview'));
const Profile = lazyWithReload(() => import('@/app/pages/Profile'));
const EditProfile = lazyWithReload(() => import('@/app/pages/EditProfile'));
const CheckInsList = lazyWithReload(() => import('@/app/pages/CheckInsList'));
const Favorites = lazyWithReload(() => import('@/app/pages/Favorites'));
const Groups = lazyWithReload(() => import('@/app/pages/Groups'));
const CreateGroup = lazyWithReload(() => import('@/app/pages/CreateGroup'));
const GroupDetail = lazyWithReload(() => import('@/app/pages/GroupDetail'));
const JoinGroup = lazyWithReload(() => import('@/app/pages/JoinGroup'));
const Notifications = lazyWithReload(() => import('@/app/pages/Notifications'));

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
      <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">
        progress_activity
      </span>
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
          <Route
            path="/home"
            element={
              <Layout>
                <Home />
              </Layout>
            }
          />
          <Route
            path="/places/:placeCode"
            element={
              <Layout>
                <PlaceDetail />
              </Layout>
            }
          />
          <Route
            path="/places/:placeCode/review"
            element={
              <Layout>
                <ProtectedRoute>
                  <WriteReview />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/profile"
            element={
              <Layout>
                <Profile />
              </Layout>
            }
          />
          <Route
            path="/profile/edit"
            element={
              <Layout>
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/profile/check-ins"
            element={
              <Layout>
                <ProtectedRoute>
                  <CheckInsList />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/favorites"
            element={
              <Layout>
                <ProtectedRoute>
                  <Favorites />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/groups"
            element={
              <Layout>
                <Groups />
              </Layout>
            }
          />
          <Route
            path="/groups/new"
            element={
              <Layout>
                <ProtectedRoute>
                  <CreateGroup />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/groups/:groupCode"
            element={
              <Layout>
                <ProtectedRoute>
                  <GroupDetail />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/join"
            element={
              <Layout>
                <ProtectedRoute>
                  <JoinGroup />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/notifications"
            element={
              <Layout>
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
