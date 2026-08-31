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

async function uploadReq(path, file) {
  try {
    checkAuthTokens();
    const headers = getAuthHeaders();
    delete headers["Content-Type"]; // let the browser set the multipart boundary itself
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("id_token"); localStorage.removeItem("access_token"); localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) throw new ApiError(data?.code || "ServerError", data?.detail || `Upload failed (${res.status})`);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Upload failed");
  }
}

export const socialPublishApi = {
  status: () => req("GET", "/social-publish/status"),
  /** @param {'meta'|'linkedin'|'google_business'} platform - "meta" covers both Facebook + Instagram in one OAuth flow */
  connect: (platform) => req("GET", `/social-publish/${platform}/connect`),
  disconnect: (platform) => req("POST", `/social-publish/${platform}/disconnect`),
  /** @param {File} file - a browser File object, e.g. from an <input type="file"> */
  uploadMedia: (file) => uploadReq("/social-publish/uploads", file),
  /** @param {object} payload - {poster_id?, image_url?, caption, platforms: [...], cta_url?} — exactly one of poster_id/image_url */
  publish: (payload) => req("POST", "/social-publish/publish", payload),
  /** @param {object} payload - {poster_id?, image_url?, day_date, caption, platforms: [...facebook/instagram only], scheduled_time, cta_url?} */
  schedule: (payload) => req("POST", "/social-publish/schedule", payload),
  listScheduled: () => req("GET", "/social-publish/scheduled"),
  cancelScheduled: (scheduleId) => req("DELETE", `/social-publish/scheduled/${encodeURIComponent(scheduleId)}`),
};
