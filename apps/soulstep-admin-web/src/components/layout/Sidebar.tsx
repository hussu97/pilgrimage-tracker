import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Star,
  CheckSquare,
  Users2,
  Database,
  Languages,
  FileText,
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  Search,
  BarChart2,
  BarChart3,
  Globe,
  Zap,
  BookOpen,
} from "lucide-react";

const NAV_ITEMS: { label: string; to: string; icon: React.ElementType; end?: boolean }[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Users", to: "/users", icon: Users },
  { label: "Places", to: "/places", icon: MapPin },
  { label: "Reviews", to: "/reviews", icon: Star },
  { label: "Check-ins", to: "/check-ins", icon: CheckSquare },
  { label: "Groups", to: "/groups", icon: Users2 },
  { label: "Scraper", to: "/scraper", icon: Database },
  { label: "Coverage Map", to: "/coverage-map", icon: Globe },
  { label: "Quality", to: "/quality", icon: BarChart3 },
  { label: "Blog", to: "/blog", icon: BookOpen },
  { label: "UI Translations", to: "/translations", icon: Languages, end: true },
  { label: "Content Translations", to: "/content-translations", icon: Globe },
  { label: "Bulk Translations", to: "/translations/bulk", icon: Zap },
  { label: "SEO", to: "/seo", icon: Search },
  { label: "Analytics", to: "/analytics", icon: BarChart2 },
  { label: "Audit Log", to: "/audit-log", icon: FileText },
  { label: "Notifications", to: "/notifications", icon: Bell },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r transition-all duration-200",
          "bg-white dark:bg-dark-surface border-input-border dark:border-dark-border",
          // Desktop width
          collapsed ? "md:w-16" : "md:w-56",
          // Mobile: slide in/out
          mobileOpen ? "w-56 translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-input-border dark:border-dark-border">
          {!collapsed && (
            <span className="flex items-center gap-2 text-sm font-semibold text-text-main dark:text-white truncate">
              <img src="/logo.png" className="w-6 h-6 rounded-md shrink-0" alt="" />
              SoulStep Admin
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg transition-colors ml-auto"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            onClick={onMobileClose}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary dark:text-dark-text-secondary"
          >
            <Menu size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? to === "/"}
              onClick={onMobileClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary dark:text-dark-text-secondary hover:bg-background-light dark:hover:bg-dark-bg hover:text-text-main dark:hover:text-white"
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
