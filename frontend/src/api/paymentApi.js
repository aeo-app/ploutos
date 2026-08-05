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

async function post(path, body) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (res.status === 402) {
      throw new ApiError("PaymentRequired", data?.detail || "Payment required to access this feature.");
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

export const paymentApi = {
  getPlans: () => get("/payment/plans"),
  /** @param {string} planId - "starter" | "growth" | "scale" */
  createIntent: (planId) => post("/payment/create-intent", { plan_id: planId }),
  /** @param {string} [paymentIntentId] - if provided, also live-polls Airwallex before returning status */
  getStatus: (paymentIntentId) =>
    get(`/payment/status${paymentIntentId ? `?payment_intent_id=${encodeURIComponent(paymentIntentId)}` : ""}`),
  getHistory: () => get("/payment/history"),
};
