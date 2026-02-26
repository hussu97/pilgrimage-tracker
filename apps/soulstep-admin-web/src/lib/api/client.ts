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
  baseURL: `${import.meta.env.VITE_API_URL ?? ""}/api/v1`,
  withCredentials: true,
});

// Attach Bearer token on every request (from in-memory state)
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear in-memory token and redirect to login
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
