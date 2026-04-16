/**
 * Comprehensive unit tests for src/lib/api/admin.ts.
 *
 * Strategy: mock @/lib/api/client at the module level so every exported
 * function can be tested without real HTTP calls. Each test verifies the
 * correct HTTP method, URL, and (where applicable) request body / params.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the HTTP client ───────────────────────────────────────────────────────
// vi.mock() is hoisted above all variable declarations, so mock functions must
// be created with vi.hoisted() to be available inside the factory.

const { mockGet, mockPost, mockPatch, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    put: mockPut,
    delete: mockDelete,
    defaults: { baseURL: "/api/v1" },
  },
}));

// Import after mock is registered
import * as admin from "@/lib/api/admin";
import { apiClient } from "@/lib/api/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("login", () => {
  it("POSTs to /auth/login with body", async () => {
    mockPost.mockResolvedValue({ data: { token: "tok" } });
    const result = await admin.login({ email: "a@b.com", password: "pw" });
    expect(mockPost).toHaveBeenCalledWith("/auth/login", { email: "a@b.com", password: "pw" });
    expect(result).toEqual({ token: "tok" });
  });
});

describe("getMe", () => {
  it("GETs /users/me", async () => {
    mockGet.mockResolvedValue({ data: { user_code: "usr_1" } });
    const result = await admin.getMe();
    expect(mockGet).toHaveBeenCalledWith("/users/me");
    expect(result).toEqual({ user_code: "usr_1" });
  });
});

describe("refreshToken", () => {
  it("POSTs to /auth/refresh", async () => {
    mockPost.mockResolvedValue({ data: { token: "new_tok" } });
    const result = await admin.refreshToken();
    expect(mockPost).toHaveBeenCalledWith("/auth/refresh");
    expect(result).toEqual({ token: "new_tok" });
  });
});

describe("logoutUser", () => {
  it("POSTs to /auth/logout", async () => {
    mockPost.mockResolvedValue({ data: undefined });
    await admin.logoutUser();
    expect(mockPost).toHaveBeenCalledWith("/auth/logout");
  });
});

// ── Users ─────────────────────────────────────────────────────────────────────

describe("listUsers", () => {
  it("GETs /admin/users with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } });
    await admin.listUsers({ page: 1, page_size: 50, search: "test" });
    expect(mockGet).toHaveBeenCalledWith("/admin/users", { params: { page: 1, page_size: 50, search: "test" } });
  });

  it("GETs /admin/users without params", async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } });
    await admin.listUsers();
    expect(mockGet).toHaveBeenCalledWith("/admin/users", { params: undefined });
  });
});

describe("getUser", () => {
  it("GETs /admin/users/:code", async () => {
    mockGet.mockResolvedValue({ data: { user_code: "usr_1" } });
    await admin.getUser("usr_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/users/usr_1");
  });
});

describe("patchUser", () => {
  it("PATCHes /admin/users/:code", async () => {
    mockPatch.mockResolvedValue({ data: { user_code: "usr_1" } });
    await admin.patchUser("usr_1", { is_active: false });
    expect(mockPatch).toHaveBeenCalledWith("/admin/users/usr_1", { is_active: false });
  });
});

describe("deactivateUser", () => {
  it("DELETEs /admin/users/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deactivateUser("usr_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/users/usr_1");
  });
});

describe("listUserCheckIns", () => {
  it("GETs /admin/users/:code/check-ins", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listUserCheckIns("usr_1", { page: 1 });
    expect(mockGet).toHaveBeenCalledWith("/admin/users/usr_1/check-ins", { params: { page: 1 } });
  });
});

describe("listUserReviews", () => {
  it("GETs /admin/users/:code/reviews", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listUserReviews("usr_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/users/usr_1/reviews", { params: undefined });
  });
});

// ── Places ────────────────────────────────────────────────────────────────────

describe("listPlaces", () => {
  it("GETs /admin/places with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listPlaces({ religion: "islam", page_size: 100 });
    expect(mockGet).toHaveBeenCalledWith("/admin/places", { params: { religion: "islam", page_size: 100 } });
  });
});

describe("getPlace", () => {
  it("GETs /admin/places/:code", async () => {
    mockGet.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.getPlace("plc_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/places/plc_1");
  });
});

describe("createPlace", () => {
  it("POSTs to /admin/places", async () => {
    mockPost.mockResolvedValue({ data: { place_code: "plc_new" } });
    const body = { name: "Test", religion: "islam", place_type: "mosque", lat: 0, lng: 0 };
    await admin.createPlace(body as any);
    expect(mockPost).toHaveBeenCalledWith("/admin/places", body);
  });
});

describe("patchPlace", () => {
  it("PATCHes /admin/places/:code", async () => {
    mockPatch.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.patchPlace("plc_1", { name: "New Name" });
    expect(mockPatch).toHaveBeenCalledWith("/admin/places/plc_1", { name: "New Name" });
  });
});

describe("deletePlace", () => {
  it("DELETEs /admin/places/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deletePlace("plc_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/places/plc_1");
  });
});

describe("listPlaceImages", () => {
  it("GETs /admin/places/:code/images", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await admin.listPlaceImages("plc_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/places/plc_1/images");
  });
});

describe("deletePlaceImage", () => {
  it("DELETEs /admin/places/:code/images/:id", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deletePlaceImage("plc_1", 42);
    expect(mockDelete).toHaveBeenCalledWith("/admin/places/plc_1/images/42");
  });
});

// ── Reviews ───────────────────────────────────────────────────────────────────

describe("listReviews", () => {
  it("GETs /admin/reviews with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listReviews({ is_flagged: true });
    expect(mockGet).toHaveBeenCalledWith("/admin/reviews", { params: { is_flagged: true } });
  });
});

describe("getReview", () => {
  it("GETs /admin/reviews/:code", async () => {
    mockGet.mockResolvedValue({ data: { review_code: "rev_1" } });
    await admin.getReview("rev_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/reviews/rev_1");
  });
});

describe("patchReview", () => {
  it("PATCHes /admin/reviews/:code", async () => {
    mockPatch.mockResolvedValue({ data: { review_code: "rev_1" } });
    await admin.patchReview("rev_1", { is_flagged: false });
    expect(mockPatch).toHaveBeenCalledWith("/admin/reviews/rev_1", { is_flagged: false });
  });
});

describe("deleteReview", () => {
  it("DELETEs /admin/reviews/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteReview("rev_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/reviews/rev_1");
  });
});

// ── Check-ins ─────────────────────────────────────────────────────────────────

describe("listCheckIns", () => {
  it("GETs /admin/check-ins with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listCheckIns({ place_code: "plc_1" });
    expect(mockGet).toHaveBeenCalledWith("/admin/check-ins", { params: { place_code: "plc_1" } });
  });
});

describe("deleteCheckIn", () => {
  it("DELETEs /admin/check-ins/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteCheckIn("chk_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/check-ins/chk_1");
  });
});

// ── Groups ────────────────────────────────────────────────────────────────────

describe("listGroups", () => {
  it("GETs /admin/groups", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listGroups({ search: "pilgrims" });
    expect(mockGet).toHaveBeenCalledWith("/admin/groups", { params: { search: "pilgrims" } });
  });
});

describe("getGroup", () => {
  it("GETs /admin/groups/:code", async () => {
    mockGet.mockResolvedValue({ data: { group_code: "grp_1" } });
    await admin.getGroup("grp_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/groups/grp_1");
  });
});

describe("patchGroup", () => {
  it("PATCHes /admin/groups/:code", async () => {
    mockPatch.mockResolvedValue({ data: { group_code: "grp_1" } });
    await admin.patchGroup("grp_1", { name: "New" });
    expect(mockPatch).toHaveBeenCalledWith("/admin/groups/grp_1", { name: "New" });
  });
});

describe("deleteGroup", () => {
  it("DELETEs /admin/groups/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteGroup("grp_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/groups/grp_1");
  });
});

describe("listGroupMembers", () => {
  it("GETs /admin/groups/:code/members", async () => {
    mockGet.mockResolvedValue({ data: { members: [] } });
    await admin.listGroupMembers("grp_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/groups/grp_1/members");
  });
});

describe("removeGroupMember", () => {
  it("DELETEs /admin/groups/:code/members/:userCode", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.removeGroupMember("grp_1", "usr_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/groups/grp_1/members/usr_1");
  });
});

// ── Languages ─────────────────────────────────────────────────────────────────

describe("listLanguages", () => {
  it("GETs /languages", async () => {
    mockGet.mockResolvedValue({ data: [{ code: "en", name: "English" }] });
    const result = await admin.listLanguages();
    expect(mockGet).toHaveBeenCalledWith("/languages");
    expect(result).toEqual([{ code: "en", name: "English" }]);
  });
});

// ── Translations ──────────────────────────────────────────────────────────────

describe("listTranslations", () => {
  it("GETs /admin/translations", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await admin.listTranslations({ search: "nav" });
    expect(mockGet).toHaveBeenCalledWith("/admin/translations", { params: { search: "nav" } });
  });
});

describe("upsertTranslation", () => {
  it("PUTs /admin/translations/:key", async () => {
    mockPut.mockResolvedValue({ data: { key: "nav.home" } });
    await admin.upsertTranslation("nav.home", { values: { en: "Home" } });
    expect(mockPut).toHaveBeenCalledWith("/admin/translations/nav.home", { values: { en: "Home" } });
  });
});

describe("deleteTranslationOverrides", () => {
  it("DELETEs /admin/translations/:key", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteTranslationOverrides("nav.home");
    expect(mockDelete).toHaveBeenCalledWith("/admin/translations/nav.home");
  });
});

describe("createTranslation", () => {
  it("POSTs to /admin/translations", async () => {
    mockPost.mockResolvedValue({ data: { key: "new.key" } });
    await admin.createTranslation({ key: "new.key", values: { en: "Value" } });
    expect(mockPost).toHaveBeenCalledWith("/admin/translations", { key: "new.key", values: { en: "Value" } });
  });
});

// ── App Versions ──────────────────────────────────────────────────────────────

describe("listAppVersions", () => {
  it("GETs /admin/app-versions", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await admin.listAppVersions();
    expect(mockGet).toHaveBeenCalledWith("/admin/app-versions");
  });
});

describe("updateAppVersion", () => {
  it("PUTs /admin/app-versions/:platform", async () => {
    mockPut.mockResolvedValue({ data: { platform: "ios" } });
    await admin.updateAppVersion("ios", { min_version_hard: "2.0" });
    expect(mockPut).toHaveBeenCalledWith("/admin/app-versions/ios", { min_version_hard: "2.0" });
  });
});

// ── Content Translations ──────────────────────────────────────────────────────

describe("listContentTranslations", () => {
  it("GETs /admin/content-translations with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listContentTranslations({ entity_type: "place", lang: "ar" });
    expect(mockGet).toHaveBeenCalledWith("/admin/content-translations", {
      params: { entity_type: "place", lang: "ar" },
    });
  });
});

describe("createContentTranslation", () => {
  it("POSTs to /admin/content-translations", async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } });
    const body = { entity_type: "place", entity_code: "plc_1", lang: "ar", field: "name", translated_text: "مسجد" };
    await admin.createContentTranslation(body);
    expect(mockPost).toHaveBeenCalledWith("/admin/content-translations", body);
  });
});

describe("updateContentTranslation", () => {
  it("PUTs /admin/content-translations/:id", async () => {
    mockPut.mockResolvedValue({ data: { id: 5 } });
    await admin.updateContentTranslation(5, { translated_text: "updated" });
    expect(mockPut).toHaveBeenCalledWith("/admin/content-translations/5", { translated_text: "updated" });
  });
});

describe("deleteContentTranslation", () => {
  it("DELETEs /admin/content-translations/:id", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteContentTranslation(5);
    expect(mockDelete).toHaveBeenCalledWith("/admin/content-translations/5");
  });
});

// ── Place Attributes ──────────────────────────────────────────────────────────

describe("listPlaceAttributeDefinitions", () => {
  it("GETs /admin/place-attributes", async () => {
    mockGet.mockResolvedValue({ data: [] });
    await admin.listPlaceAttributeDefinitions();
    expect(mockGet).toHaveBeenCalledWith("/admin/place-attributes");
  });
});

// ── Bulk Operations ───────────────────────────────────────────────────────────

describe("bulkDeactivateUsers", () => {
  it("POSTs to /admin/bulk/users/deactivate", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 2, failed: 0 } });
    await admin.bulkDeactivateUsers(["usr_1", "usr_2"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/users/deactivate", { user_codes: ["usr_1", "usr_2"] });
  });
});

describe("bulkActivateUsers", () => {
  it("POSTs to /admin/bulk/users/activate", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkActivateUsers(["usr_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/users/activate", { user_codes: ["usr_1"] });
  });
});

describe("bulkFlagReviews", () => {
  it("POSTs to /admin/bulk/reviews/flag", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkFlagReviews(["rev_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/reviews/flag", { review_codes: ["rev_1"] });
  });
});

describe("bulkUnflagReviews", () => {
  it("POSTs to /admin/bulk/reviews/unflag", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkUnflagReviews(["rev_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/reviews/unflag", { review_codes: ["rev_1"] });
  });
});

describe("bulkDeleteReviews", () => {
  it("POSTs to /admin/bulk/reviews/delete", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkDeleteReviews(["rev_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/reviews/delete", { review_codes: ["rev_1"] });
  });
});

describe("bulkDeleteCheckIns", () => {
  it("POSTs to /admin/bulk/check-ins/delete", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkDeleteCheckIns(["chk_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/check-ins/delete", { check_in_codes: ["chk_1"] });
  });
});

describe("bulkDeletePlaces", () => {
  it("POSTs to /admin/bulk/places/delete", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkDeletePlaces(["plc_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/places/delete", { place_codes: ["plc_1"] });
  });
});

describe("bulkDeleteGroups", () => {
  it("POSTs to /admin/bulk/groups/delete", async () => {
    mockPost.mockResolvedValue({ data: { succeeded: 1, failed: 0 } });
    await admin.bulkDeleteGroups(["grp_1"]);
    expect(mockPost).toHaveBeenCalledWith("/admin/bulk/groups/delete", { group_codes: ["grp_1"] });
  });
});

// ── Export ────────────────────────────────────────────────────────────────────

describe("exportUrl", () => {
  it("builds the correct export URL using baseURL from apiClient", () => {
    const url = admin.exportUrl("users", "csv");
    expect(url).toBe("/api/v1/admin/export/users?format=csv");
  });

  it("works for json format", () => {
    const url = admin.exportUrl("places", "json");
    expect(url).toBe("/api/v1/admin/export/places?format=json");
  });

  it("falls back to /api/v1 when baseURL is undefined", () => {
    const prev = apiClient.defaults.baseURL;
    apiClient.defaults.baseURL = undefined;
    try {
      const url = admin.exportUrl("groups", "csv");
      expect(url).toBe("/api/v1/admin/export/groups?format=csv");
    } finally {
      apiClient.defaults.baseURL = prev;
    }
  });
});

// ── Audit Log ─────────────────────────────────────────────────────────────────

describe("listAuditLog", () => {
  it("GETs /admin/audit-log with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listAuditLog({ action: "delete", page: 1 });
    expect(mockGet).toHaveBeenCalledWith("/admin/audit-log", { params: { action: "delete", page: 1 } });
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

describe("broadcastNotification", () => {
  it("POSTs to /admin/notifications/broadcast", async () => {
    mockPost.mockResolvedValue({ data: { sent: 10 } });
    await admin.broadcastNotification({ type: "info", payload: { msg: "hello" } });
    expect(mockPost).toHaveBeenCalledWith("/admin/notifications/broadcast", {
      type: "info",
      payload: { msg: "hello" },
    });
  });
});

describe("sendNotification", () => {
  it("POSTs to /admin/notifications/send", async () => {
    mockPost.mockResolvedValue({ data: { sent: 1 } });
    await admin.sendNotification({ user_codes: ["usr_1"], type: "update" });
    expect(mockPost).toHaveBeenCalledWith("/admin/notifications/send", {
      user_codes: ["usr_1"],
      type: "update",
    });
  });
});

describe("listNotificationHistory", () => {
  it("GETs /admin/notifications/history", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listNotificationHistory({ page: 1 });
    expect(mockGet).toHaveBeenCalledWith("/admin/notifications/history", { params: { page: 1 } });
  });
});

// ── SEO ───────────────────────────────────────────────────────────────────────

describe("getSEOStats", () => {
  it("GETs /admin/seo/stats", async () => {
    mockGet.mockResolvedValue({ data: { total: 100 } });
    await admin.getSEOStats();
    expect(mockGet).toHaveBeenCalledWith("/admin/seo/stats");
  });
});

describe("listSEOPlaces", () => {
  it("GETs /admin/seo/places with params", async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await admin.listSEOPlaces({ missing_only: true });
    expect(mockGet).toHaveBeenCalledWith("/admin/seo/places", { params: { missing_only: true } });
  });
});

describe("getSEODetail", () => {
  it("GETs /admin/seo/places/:code", async () => {
    mockGet.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.getSEODetail("plc_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/seo/places/plc_1");
  });
});

describe("patchSEO", () => {
  it("PATCHes /admin/seo/places/:code", async () => {
    mockPatch.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.patchSEO("plc_1", { seo_title: "Title" });
    expect(mockPatch).toHaveBeenCalledWith("/admin/seo/places/plc_1", { seo_title: "Title" });
  });
});

describe("regenerateSEO", () => {
  it("POSTs to /admin/seo/places/:code/generate with default params", async () => {
    mockPost.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.regenerateSEO("plc_1");
    expect(mockPost).toHaveBeenCalledWith(
      "/admin/seo/places/plc_1/generate",
      null,
      { params: { force: false, langs: "en" } }
    );
  });

  it("POSTs with force=true and langs", async () => {
    mockPost.mockResolvedValue({ data: { place_code: "plc_1" } });
    await admin.regenerateSEO("plc_1", true, ["en", "ar"]);
    expect(mockPost).toHaveBeenCalledWith(
      "/admin/seo/places/plc_1/generate",
      null,
      { params: { force: true, langs: "en,ar" } }
    );
  });
});

describe("bulkGenerateSEO", () => {
  it("POSTs to /admin/seo/generate", async () => {
    mockPost.mockResolvedValue({ data: { queued: 5 } });
    await admin.bulkGenerateSEO({ force: true, limit: 10 });
    expect(mockPost).toHaveBeenCalledWith("/admin/seo/generate", { force: true, limit: 10 });
  });
});

describe("regenSlugs", () => {
  it("POSTs to /admin/seo/regen-slugs and returns result", async () => {
    const result = { updated: 42, unchanged: 10, errors: 0 };
    mockPost.mockResolvedValue({ data: result });
    const res = await admin.regenSlugs();
    expect(mockPost).toHaveBeenCalledWith("/admin/seo/regen-slugs");
    expect(res).toEqual(result);
  });
});

describe("regenAltTexts", () => {
  it("POSTs to /admin/seo/regen-alt-texts and returns result", async () => {
    const result = { images_updated: 150, places_processed: 80, errors: 0 };
    mockPost.mockResolvedValue({ data: result });
    const res = await admin.regenAltTexts();
    expect(mockPost).toHaveBeenCalledWith("/admin/seo/regen-alt-texts");
    expect(res).toEqual(result);
  });
});

// ── Bulk Translation Jobs ─────────────────────────────────────────────────────

describe("listTranslationJobs", () => {
  it("GETs /admin/translations/jobs", async () => {
    mockGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 50 } });
    await admin.listTranslationJobs({ page: 1, page_size: 50 });
    expect(mockGet).toHaveBeenCalledWith("/admin/translations/jobs", { params: { page: 1, page_size: 50 } });
  });
});

describe("getTranslationJob", () => {
  it("GETs /admin/translations/jobs/:code", async () => {
    mockGet.mockResolvedValue({ data: { job_code: "btj_1" } });
    await admin.getTranslationJob("btj_1");
    expect(mockGet).toHaveBeenCalledWith("/admin/translations/jobs/btj_1");
  });
});

describe("deleteTranslationJob", () => {
  it("DELETEs /admin/translations/jobs/:code", async () => {
    mockDelete.mockResolvedValue({ data: undefined });
    await admin.deleteTranslationJob("btj_1");
    expect(mockDelete).toHaveBeenCalledWith("/admin/translations/jobs/btj_1");
  });
});
