import { withTokenExpiry, ApiError } from "./authApi"; // shared ApiError class — see authApi.js comment

// const BASE = "https://api.aeo-app.ai/api/v1";
export const BASE = "http://127.0.0.1:8000/api/v1"; // Local development

// 🔹 Check Token & User Validity (forcefully redirect to login if missing)
// Exported so every other API module (socialApi.js, etc.) reuses THIS exact
// implementation and the shared ApiError class above — see authApi.js's
// comment on why duplicating this per-module previously broke token-expiry
// redirects.
export const checkAuthTokens = () => {
  const idToken = localStorage.getItem("id_token");
  const userId = localStorage.getItem("user_id");

  // If either token or user_id is missing, force login
  if (!idToken || !userId) {
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
  }

  return { idToken, userId };
};

// 🔹 Centralized Auth Headers
export const getAuthHeaders = () => {
  const { idToken, userId } = checkAuthTokens(); // This will throw if tokens missing

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`, // Use id_token specifically
    "X-User-ID": userId, // Always include user_id
  };
};

// 🔹 Generic POST helper with token expiry handling
async function post(path, body) {
  try {
    // Validate tokens before making request
    checkAuthTokens();

    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    // Handle 401 Unauthorized (Token Expired)
    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }

    if (!res.ok) {
      const errorCode = data?.code || data?.error_code || "ServerError";
      const errorMessage = data?.detail || data?.message || `Request failed (${res.status})`;
      throw new ApiError(errorCode, errorMessage);
    }

    return data;
  } catch (error) {
    // Re-throw as-is if already ApiError
    if (error instanceof ApiError) {
      throw error;
    }
    // Convert other errors
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

// 🔹 SEO APIs
export const seoApi = {
  competitors: (req) => post("/seo/competitors", req),
  keywords: (req) => post("/seo/keywords", req),
  profile: (req) => post("/seo/profile", req),
  domainAuthority: (req) => post("/seo/domain-authority", req),
  fullReport: (req) => post("/seo/full-report", req),
  contentStrategy: (req) => post("/seo/content-strategy", req),

  /**
   * Streams POST /seo/content-strategy/stream as Server-Sent Events.
   *
   * Native `EventSource` can't be used here — it only supports GET requests
   * with no custom headers/body, and this endpoint needs a POST body + an
   * Authorization header. Instead we read the fetch response body as a
   * stream and parse SSE frames ("event: x\ndata: y\n\n") by hand.
   *
   * @param {object} req - ContentStrategyRequest body
   * @param {(event: string, data: any) => void} onEvent - called per SSE event
   * @param {AbortSignal} [signal] - to cancel the stream (e.g. on unmount)
   */
  contentStrategyStream: async (req, onEvent, signal) => {
    checkAuthTokens();
    const res = await fetch(`${BASE}/seo/content-strategy/stream`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(req),
      signal,
    });

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(
        data?.code || "ServerError",
        data?.detail || data?.message || `Request failed (${res.status})`
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line ("\n\n")
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName = "message";
        let dataLines = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;

        let payload;
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          continue; // skip malformed frame rather than killing the whole stream
        }
        onEvent(eventName, payload);
      }
    }
  },
};