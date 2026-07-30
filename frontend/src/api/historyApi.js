import { ApiError } from "./authApi"; // shared ApiError class
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi"; // reuse the same auth plumbing

async function get(path) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}${path}`, { method: "GET", headers: getAuthHeaders() });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) {
      throw new ApiError(
        data?.code || "ServerError",
        data?.detail || data?.message || `Request failed (${res.status})`
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

async function del(path) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: getAuthHeaders() });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) {
      throw new ApiError(
        data?.code || "ServerError",
        data?.detail || data?.message || `Request failed (${res.status})`
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

export const historyApi = {
  /**
   * @param {object} opts
   * @param {string} [opts.analysisType] - filter by analysis_type
   * @param {number} [opts.limit] - page size (1-100)
   * @param {object} [opts.lastKey] - pagination cursor from a previous response's last_evaluated_key
   */
  list: ({ analysisType, limit = 20, lastKey } = {}) => {
    const params = new URLSearchParams();
    if (analysisType) params.set("analysis_type", analysisType);
    params.set("limit", String(limit));
    if (lastKey) params.set("last_key", JSON.stringify(lastKey));
    return get(`/history?${params.toString()}`);
  },
  stats: () => get(`/history/stats`),
  getOne: (analysisId) => get(`/history/${encodeURIComponent(analysisId)}`),
  remove: (analysisId) => del(`/history/${encodeURIComponent(analysisId)}`),
};
