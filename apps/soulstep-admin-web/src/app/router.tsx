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
import { ContentTranslationsPage } from "./pages/content/ContentTranslationsPage";
import { PlaceAttributesPage } from "./pages/content/PlaceAttributesPage";
import { BulkTranslationsPage } from "./pages/content/BulkTranslationsPage";
import { AuditLogPage } from "./pages/audit-log/AuditLogPage";
import { NotificationManagementPage } from "./pages/notifications/NotificationManagementPage";
import { SEODashboardPage } from "./pages/seo/SEODashboardPage";
import { SEOPlaceDetailPage } from "./pages/seo/SEOPlaceDetailPage";
import { SEOTemplatesPage } from "./pages/seo/SEOTemplatesPage";
import { AnalyticsDashboardPage } from "./pages/analytics/AnalyticsDashboardPage";

function AdminSplash() {
  return (
    <>
      <style>{`
        @keyframes adminLogoIn {
          0% { opacity: 0; transform: scale(0.5); }
          70% { transform: scale(1.07); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes adminRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes adminTextIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes adminDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
          40% { transform: scale(1.5); opacity: 1; }
        }
        @keyframes adminGlow {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.1); opacity: 0.65; }
        }
      `}</style>
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A1A1A] overflow-hidden relative select-none">
        {/* Ambient glow rings */}
        <div className="absolute rounded-full bg-[#B0563D]/[0.08]"
          style={{ width: 520, height: 520, top: '50%', left: '50%', translate: '-50% -50%', animation: 'adminGlow 5s ease-in-out infinite' }} />
        <div className="absolute rounded-full bg-[#B0563D]/[0.12]"
          style={{ width: 320, height: 320, top: '50%', left: '50%', translate: '-50% -50%', animation: 'adminGlow 3.5s ease-in-out infinite 0.6s' }} />

        {/* Logo */}
        <div style={{ animation: 'adminLogoIn 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards', opacity: 0 }} className="relative">
          <div className="absolute" style={{ width: 136, height: 136, top: -20, left: -20, borderRadius: '50%', border: '1px solid rgba(176,86,61,0.18)', animation: 'adminRingSpin 9s linear infinite reverse' }} />
          <div className="absolute" style={{ width: 116, height: 116, top: -10, left: -10, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#B0563D', borderRightColor: 'rgba(176,86,61,0.35)', animation: 'adminRingSpin 4.5s linear infinite' }} />
          <div className="w-96px h-96px w-24 h-24 rounded-full bg-[#242424] flex items-center justify-center relative z-10"
            style={{ boxShadow: '0 18px 56px rgba(176,86,61,0.3), 0 4px 14px rgba(0,0,0,0.4)' }}>
            <svg width="44" height="44" viewBox="0 0 46 46" fill="none">
              <circle cx="23" cy="23" r="20" stroke="#B0563D" strokeWidth="1" strokeOpacity="0.25" fill="none"/>
              <circle cx="23" cy="23" r="3.5" fill="#B0563D"/>
              <path d="M23 5 L25.2 20.8 L23 23 L20.8 20.8 Z" fill="#B0563D"/>
              <path d="M41 23 L25.2 25.2 L23 23 L25.2 20.8 Z" fill="#9CA3AF" fillOpacity="0.65"/>
              <path d="M23 41 L20.8 25.2 L23 23 L25.2 25.2 Z" fill="#9CA3AF" fillOpacity="0.55"/>
              <path d="M5 23 L20.8 20.8 L23 23 L20.8 25.2 Z" fill="#9CA3AF" fillOpacity="0.4"/>
              <circle cx="23" cy="23" r="16" stroke="#B0563D" strokeWidth="0.5" strokeOpacity="0.15" fill="none" strokeDasharray="3 4"/>
            </svg>
          </div>
        </div>

        {/* Brand */}
        <div style={{ animation: 'adminTextIn 0.7s ease-out 0.35s forwards', opacity: 0 }} className="mt-9 flex flex-col items-center gap-1">
          <h1 className="text-[2.4rem] font-bold text-white" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
            SoulStep
          </h1>
          <span className="text-xs font-semibold text-[#B0563D] tracking-[0.22em] uppercase">Admin</span>
        </div>

        <div style={{ animation: 'adminTextIn 0.5s ease-out 0.6s forwards', opacity: 0 }} className="mt-2">
          <p className="text-[10px] font-medium text-[#A39C94] tracking-[0.18em] uppercase">Sacred Sites · Every Step</p>
        </div>

        {/* Dots */}
        <div style={{ animation: 'adminTextIn 0.5s ease-out 0.8s forwards', opacity: 0 }} className="mt-14 flex gap-2 items-center">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#B0563D]"
              style={{ animation: `adminDot 1.5s ease-in-out ${i * 0.22}s infinite` }} />
          ))}
        </div>
      </div>
    </>
  );
}

/** Redirect to /login if not authenticated. */
function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AdminSplash />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Redirect to /access-denied if authenticated but not admin. */
function RequireAdmin() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <AdminSplash />;
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
              { path: "/content-translations", element: <ContentTranslationsPage /> },
              { path: "/place-attributes", element: <PlaceAttributesPage /> },
              { path: "/translations/bulk", element: <BulkTranslationsPage /> },
              // SEO & Discoverability
              { path: "/seo", element: <SEODashboardPage /> },
              { path: "/seo/templates", element: <SEOTemplatesPage /> },
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
