import { apiClient } from "./client";
import type { AuthResponse, LoginBody, User } from "./types";

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(body: LoginBody): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>("/auth/login", body);
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await apiClient.get<User>("/users/me");
  return res.data;
}

// ── Admin — placeholder for future endpoints ──────────────────────────────────
// Phase 2+ endpoints will be added here (users, places, reviews, etc.)
