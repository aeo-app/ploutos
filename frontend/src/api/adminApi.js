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
    if (res.status === 403) {
      throw new ApiError("AdminRequired", data?.detail || "Admin access required.");
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
    if (res.status === 403) throw new ApiError("AdminRequired", data?.detail || "Admin access required.");
    if (!res.ok) throw new ApiError(data?.code || "ServerError", data?.detail || `Upload failed (${res.status})`);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Upload failed");
  }
}

export const adminApi = {
  listUsers: () => req("GET", "/admin/users"),
  setAdmin: (userId, isAdmin) => req("POST", `/admin/users/${encodeURIComponent(userId)}/set-admin`, { is_admin: isAdmin }),

  listUserCalendars: (userId) => req("GET", `/admin/users/${encodeURIComponent(userId)}/calendars`),
  getUserCalendar: (userId, analysisId) =>
    req("GET", `/admin/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(analysisId)}`),
  updateUserCalendar: (userId, analysisId, result) =>
    req("PUT", `/admin/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(analysisId)}`, { result }),
  /** @param {string} date - "YYYY-MM-DD" @param {number} postNumber - 1 or 2 @param {string} instruction */
  reviseCalendarPost: (userId, analysisId, date, postNumber, instruction) =>
    req("POST", `/admin/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(analysisId)}/revise-post`, {
      date, post_number: postNumber, instruction,
    }),
  /** @param {object} payload - {country, start_date, end_date, phone?, email?, website?, instagram?, facebook?, linkedin?, content_suggestions?} - admin creates a NEW calendar, saved under the CUSTOMER's account */
  createCalendarForUser: (userId, payload) =>
    req("POST", `/admin/users/${encodeURIComponent(userId)}/calendars/create`, payload),

  listUserBlogs: (userId) => req("GET", `/admin/users/${encodeURIComponent(userId)}/blogs`),
  getUserBlog: (userId, analysisId) =>
    req("GET", `/admin/users/${encodeURIComponent(userId)}/blogs/${encodeURIComponent(analysisId)}`),
  updateUserBlog: (userId, analysisId, result) =>
    req("PUT", `/admin/users/${encodeURIComponent(userId)}/blogs/${encodeURIComponent(analysisId)}`, { result }),
  reviseUserBlog: (userId, analysisId, instruction) =>
    req("POST", `/admin/users/${encodeURIComponent(userId)}/blogs/${encodeURIComponent(analysisId)}/revise`, { instruction }),
  /** @param {string} topic @param {string} [targetKeyword] @param {string} [instruction] - admin creates a NEW blog, saved under the CUSTOMER's account */
  createBlogForUser: (userId, topic, targetKeyword, instruction) =>
    req("POST", `/admin/users/${encodeURIComponent(userId)}/blogs/create`, {
      topic, target_keyword: targetKeyword || '', instruction: instruction || '',
    }),

  socialStatus: (userId) => req("GET", `/admin/users/${encodeURIComponent(userId)}/social-publish/status`),
  socialUploadMedia: (userId, file) => uploadReq(`/admin/users/${encodeURIComponent(userId)}/social-publish/uploads`, file),
  /** @param {object} payload - {poster_id?, image_url?, caption, platforms: [...], cta_url?} — exactly one of poster_id/image_url */
  socialPublish: (userId, payload) => req("POST", `/admin/users/${encodeURIComponent(userId)}/social-publish/publish`, payload),
  /** @param {object} payload - {poster_id?, image_url?, day_date, caption, platforms: [...facebook/instagram only], scheduled_time, cta_url?} */
  socialSchedule: (userId, payload) => req("POST", `/admin/users/${encodeURIComponent(userId)}/social-publish/schedule`, payload),
  socialListScheduled: (userId) => req("GET", `/admin/users/${encodeURIComponent(userId)}/social-publish/scheduled`),
  socialRetryScheduled: (userId, scheduleId) =>
    req("POST", `/admin/users/${encodeURIComponent(userId)}/social-publish/scheduled/${encodeURIComponent(scheduleId)}/retry`),
  socialCancelScheduled: (userId, scheduleId) =>
    req("DELETE", `/admin/users/${encodeURIComponent(userId)}/social-publish/scheduled/${encodeURIComponent(scheduleId)}`),
};
