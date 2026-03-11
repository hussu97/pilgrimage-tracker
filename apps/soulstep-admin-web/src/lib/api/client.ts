import axios from "axios";

// In-memory token — never persisted to localStorage (prevents XSS token theft).
// The backend sets an httpOnly access_token cookie; the axios client sends it
// automatically via withCredentials: true. The in-memory token is also injected
// as an Authorization header for endpoints that validate it that way.
let _inMemoryToken: string | null = null;

export function getToken(): string | null {
  return _inMemoryToken;
}

export function setToken(token: string): void {
  _inMemoryToken = token;
}

export function clearToken(): void {
  _inMemoryToken = null;
}

export const apiClient = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
});

// Scraper client — routes to the scraper API.
// When VITE_SCRAPER_API_URL is set (local-dev hybrid mode), calls go directly
// to the local scraper service so the prod catalog proxy is bypassed.
// Otherwise falls back through the Vite proxy → catalog proxy path.
// Either way, scraper.ts uses short paths like /data-locations or /runs.
const _scraperBase = import.meta.env.VITE_SCRAPER_API_URL
  ? `${import.meta.env.VITE_SCRAPER_API_URL}/api/v1/scraper`
  : "/api/v1/admin/scraper";

export const scraperClient = axios.create({ baseURL: _scraperBase });

// Attach Bearer token on every request (from in-memory state)
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear in-memory token and redirect to login.
// Guard against redirecting when already on /login — otherwise AuthProvider's
// getMe() call (which always 401s when unauthenticated) would cause an infinite
// hard-reload loop that also produces dark/light mode flickering on every reload.
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
