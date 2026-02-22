import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-dark-bg p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-card p-8">
          <h1 className="text-2xl font-bold text-text-main dark:text-white mb-1">
            Admin Login
          </h1>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary mb-6">
            Sign in to the Pilgrimage Tracker admin panel.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-main dark:text-white mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3.5 py-2.5 text-sm text-text-main dark:text-white placeholder:text-text-muted dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-main dark:text-white mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-input-border dark:border-dark-border bg-white dark:bg-dark-bg px-3.5 py-2.5 text-sm text-text-main dark:text-white placeholder:text-text-muted dark:placeholder:text-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
