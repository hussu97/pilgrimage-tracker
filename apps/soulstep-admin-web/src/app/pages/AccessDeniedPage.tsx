import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";
import { ShieldOff } from "lucide-react";

export function AccessDeniedPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-dark-bg p-4">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <ShieldOff size={32} className="text-red-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-text-main dark:text-white mb-2">
          Access Denied
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-6">
          Your account does not have admin privileges. Contact an administrator
          if you believe this is a mistake.
        </p>
        <button
          onClick={handleLogout}
          className="rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-5 py-2.5 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
