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
import { ScraperOverviewPage } from "./pages/scraper/ScraperOverviewPage";
import { DataLocationsPage } from "./pages/scraper/DataLocationsPage";
import { ScraperRunsPage } from "./pages/scraper/ScraperRunsPage";
import { RunDetailPage } from "./pages/scraper/RunDetailPage";
import { CollectorsPage } from "./pages/scraper/CollectorsPage";
import { PlaceTypeMappingsPage } from "./pages/scraper/PlaceTypeMappingsPage";
import { QualityMetricsPage } from "./pages/scraper/QualityMetricsPage";
import { CoverageMapPage } from "./pages/scraper/CoverageMapPage";
import { TranslationsPage } from "./pages/content/TranslationsPage";
import { AppVersionsPage } from "./pages/content/AppVersionsPage";
import { ContentTranslationsPage } from "./pages/content/ContentTranslationsPage";
import { PlaceAttributesPage } from "./pages/content/PlaceAttributesPage";
import { BulkTranslationsPage } from "./pages/content/BulkTranslationsPage";
import { AuditLogPage } from "./pages/audit-log/AuditLogPage";
import { NotificationManagementPage } from "./pages/notifications/NotificationManagementPage";
import { SEODashboardPage } from "./pages/seo/SEODashboardPage";
import { SEOPlaceDetailPage } from "./pages/seo/SEOPlaceDetailPage";
import { AnalyticsDashboardPage } from "./pages/analytics/AnalyticsDashboardPage";

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
              // Scraper
              { path: "/scraper", element: <ScraperOverviewPage /> },
              { path: "/scraper/data-locations", element: <DataLocationsPage /> },
              { path: "/scraper/runs", element: <ScraperRunsPage /> },
              { path: "/scraper/runs/:runCode", element: <RunDetailPage /> },
              { path: "/scraper/collectors", element: <CollectorsPage /> },
              { path: "/scraper/place-type-mappings", element: <PlaceTypeMappingsPage /> },
              { path: "/scraper/quality", element: <Navigate to="/quality" replace /> },
              { path: "/quality", element: <QualityMetricsPage /> },
              { path: "/coverage-map", element: <CoverageMapPage /> },
              // Content & Configuration (Phase 4)
              { path: "/translations", element: <TranslationsPage /> },
              { path: "/app-versions", element: <AppVersionsPage /> },
              { path: "/content-translations", element: <ContentTranslationsPage /> },
              { path: "/place-attributes", element: <PlaceAttributesPage /> },
              { path: "/translations/bulk", element: <BulkTranslationsPage /> },
              // SEO & Discoverability
              { path: "/seo", element: <SEODashboardPage /> },
              { path: "/seo/:placeCode", element: <SEOPlaceDetailPage /> },
              // Analytics
              { path: "/analytics", element: <AnalyticsDashboardPage /> },
              // Audit Log & Notifications (Phase 6)
              { path: "/audit-log", element: <AuditLogPage /> },
              { path: "/notifications", element: <NotificationManagementPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];
