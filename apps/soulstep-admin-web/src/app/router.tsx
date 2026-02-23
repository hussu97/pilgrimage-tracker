import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { AccessDeniedPage } from "./pages/AccessDeniedPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersListPage } from "./pages/users/UsersListPage";
import { UserDetailPage } from "./pages/users/UserDetailPage";
import { PlacesListPage } from "./pages/places/PlacesListPage";
import { PlaceDetailPage } from "./pages/places/PlaceDetailPage";
import { CreatePlacePage } from "./pages/places/CreatePlacePage";
import { ReviewsListPage } from "./pages/reviews/ReviewsListPage";
import { ReviewDetailPage } from "./pages/reviews/ReviewDetailPage";
import { CheckInsListPage } from "./pages/check-ins/CheckInsListPage";
import { GroupsListPage } from "./pages/groups/GroupsListPage";
import { GroupDetailPage } from "./pages/groups/GroupDetailPage";

/** Redirect to /login if not authenticated. */
function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Redirect to /access-denied if authenticated but not admin. */
function RequireAdmin() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/access-denied" replace />;
  return <Outlet />;
}

export const routes = [
  { path: "/login", element: <LoginPage /> },
  { path: "/access-denied", element: <AccessDeniedPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: "/", element: <DashboardPage /> },
              // Users
              { path: "/users", element: <UsersListPage /> },
              { path: "/users/:userCode", element: <UserDetailPage /> },
              // Places
              { path: "/places", element: <PlacesListPage /> },
              { path: "/places/new", element: <CreatePlacePage /> },
              { path: "/places/:placeCode", element: <PlaceDetailPage /> },
              // Reviews
              { path: "/reviews", element: <ReviewsListPage /> },
              { path: "/reviews/:reviewCode", element: <ReviewDetailPage /> },
              // Check-ins
              { path: "/check-ins", element: <CheckInsListPage /> },
              // Groups
              { path: "/groups", element: <GroupsListPage /> },
              { path: "/groups/:groupCode", element: <GroupDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
