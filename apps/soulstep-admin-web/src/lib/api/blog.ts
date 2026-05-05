import { apiClient } from "./client";
import type {
  AdminBlogListResponse,
  AdminBlogPost,
  AdminBlogPostDetail,
  CreateBlogPostBody,
  LinkPreviewResult,
  PatchBlogPostBody,
} from "./types";

export async function listAdminBlogPosts(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  is_published?: boolean;
}): Promise<AdminBlogListResponse> {
  const res = await apiClient.get<AdminBlogListResponse>("/admin/blog/posts", { params });
  return res.data;
}

export async function getAdminBlogPost(postCode: string): Promise<AdminBlogPostDetail> {
  const res = await apiClient.get<AdminBlogPostDetail>(`/admin/blog/posts/${postCode}`);
  return res.data;
}

export async function createBlogPost(body: CreateBlogPostBody): Promise<AdminBlogPostDetail> {
  const res = await apiClient.post<AdminBlogPostDetail>("/admin/blog/posts", body);
  return res.data;
}

export async function updateBlogPost(
  postCode: string,
  body: PatchBlogPostBody
): Promise<AdminBlogPostDetail> {
  const res = await apiClient.patch<AdminBlogPostDetail>(`/admin/blog/posts/${postCode}`, body);
  return res.data;
}

export async function deleteBlogPost(postCode: string): Promise<void> {
  await apiClient.delete(`/admin/blog/posts/${postCode}`);
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewResult> {
  const res = await apiClient.post<LinkPreviewResult>("/admin/blog/link-preview", { url });
  return res.data;
}
