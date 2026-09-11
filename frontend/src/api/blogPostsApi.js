import { ApiError } from "./authApi";
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi";

async function req(method, path, body) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: getAuthHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) {
      throw new ApiError(data?.code || "ServerError", data?.detail || data?.message || `Request failed (${res.status})`);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

export const blogPostsApi = {
  /** @param {object} payload - {title, markdown_content, status: 'draft'|'published', author?, cover_image_url?} */
  create: (payload) => req("POST", "/blog-posts", payload),
  /** @param {'draft'|'published'} [status] - omit for all */
  list: (status) => req("GET", `/blog-posts${status ? `?status=${status}` : ""}`),
  get: (postId) => req("GET", `/blog-posts/${encodeURIComponent(postId)}`),
  /** @param {object} payload - any subset of {title, markdown_content, status, author, cover_image_url} */
  update: (postId, payload) => req("PUT", `/blog-posts/${encodeURIComponent(postId)}`, payload),
  delete: (postId) => req("DELETE", `/blog-posts/${encodeURIComponent(postId)}`),
};
