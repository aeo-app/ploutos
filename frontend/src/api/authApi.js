// export const BASE_URL = "https://api.aeo-app.ai/api/v1";
const BASE_URL = "http://127.0.0.1:8000/api/v1"; // Local development

// 🔹 Error message mapping
const ERROR_MESSAGES = {
  UsernameExistsException:
    "This email is already registered. Please sign in instead.",
  InvalidCredentials: "Invalid email or password. Please try again.",
  UserNotFound: "User not found. Please check your email address.",
  InvalidPassword: "Password is incorrect. Please try again.",
  ValidationError: "Please check your input and try again.",
  NetworkError: "Network error. Please check your connection and try again.",
  ServerError: "Server error. Please try again later.",
  TokenExpired: "Your session has expired. Please sign in again.",
  ExpiredTokenException: "Your session has expired. Please sign in again.",
  InvalidCode: "Invalid verification code. Please try again.",
  CodeExpired: "Verification code has expired. Please request a new one.",
};

// 🔹 Custom Error Class
// Exported so every other API module (seoApi.js, etc.) reuses THIS exact
// class rather than declaring its own duplicate. Previously seoApi.js had
// its own separate `class ApiError`, which meant `error instanceof ApiError`
// below always evaluated to false for SEO API errors — silently breaking
// the forced-redirect-to-login behavior for every SEO endpoint.
export class ApiError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = "ApiError";
  }
}

const isSessionExpiredError = (code) =>
  code === "TokenExpired" ||
  code === "ExpiredTokenException" ||
  code === "ExpiredToken";

const isSessionExpiredPayload = (value) => {
  if (typeof value !== "string") return false;

  const normalized = value.toLowerCase();
  return (
    normalized.includes("expiredtokenexception") ||
    normalized.includes("security token included in the request is expired") ||
    normalized.includes("token is expired") ||
    normalized.includes("token expired")
  );
};

// 🔹 Parse error response
const parseError = (err) => {
  // If already an Error object with custom message
  if (err instanceof Error && err.code) {
    const code = isSessionExpiredError(err.code) ? "ExpiredTokenException" : err.code;
    return { code, message: err.message, field: err.field };
  }

  // Handle string errors
  if (typeof err === "string") {
    if (isSessionExpiredPayload(err)) {
      return { code: "ExpiredTokenException", message: ERROR_MESSAGES.ExpiredTokenException };
    }
    return { code: "ServerError", message: err };
  }

  // Handle object errors
  if (typeof err === "object") {
    // Nested detail structure: { detail: { code: '...', message: '...' } }
    if (err.detail && typeof err.detail === "object") {
      const code = isSessionExpiredError(err.detail.code || err.detail.error_code)
        ? "ExpiredTokenException"
        : (err.detail.code || err.detail.error_code || "ServerError");
      const message =
        err.detail.message || ERROR_MESSAGES[code] || "An error occurred";
      return { code, message, field: err.detail.field };
    }

    if (err.detail && typeof err.detail === "string") {
      if (isSessionExpiredPayload(err.detail)) {
        return { code: "ExpiredTokenException", message: ERROR_MESSAGES.ExpiredTokenException };
      }
      return { code: "ServerError", message: err.detail };
    }

    // Direct structure: { code: '...', message: '...' }
    if (err.code) {
      const code = isSessionExpiredError(err.code) ? "ExpiredTokenException" : err.code;
      const message =
        err.message || ERROR_MESSAGES[code] || "An error occurred";
      return { code, message, field: err.field };
    }

    // Message only
    if (err.message) {
      if (isSessionExpiredPayload(err.message)) {
        return { code: "ExpiredTokenException", message: ERROR_MESSAGES.ExpiredTokenException };
      }
      return { code: "ServerError", message: err.message };
    }
  }

  return { code: "ServerError", message: "An unknown error occurred" };
};

// 🔹 Common Fetch Client
export const fetchClient = async (
  url,
  options = {},
  useAccessToken = false,
) => {
  try {
    const token = useAccessToken
      ? localStorage.getItem("access_token")
      : localStorage.getItem("id_token");

    if (useAccessToken && !token) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("ExpiredTokenException", ERROR_MESSAGES.ExpiredTokenException);
    }

    const res = await fetch(`${BASE_URL}${url}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers || {}),
      },
      body: options.body,
    });

    const data = await res.json().catch(() => ({}));

    // Handle 401 Unauthorized (Token Expired)
    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("ExpiredTokenException", ERROR_MESSAGES.ExpiredTokenException);
    }

    // ✅ Handle signup response - returns ID token for verification
    // if (url === "/auth/signup" && res.ok) {
    //   localStorage.setItem("id_token", data?.id_token);
    //   return data;
    // }

    // // ✅ Handle verify response - returns full tokens
    // if ((url === "/auth/verify" || url === "/auth/verify-email") && res.ok) {
    //   localStorage.setItem("id_token", data?.id_token);
    //   localStorage.setItem("access_token", data?.access_token);
    //   await getUserInfo();
    // }

    // ✅ Handle login response - returns full tokens
    if (res.ok) {
      if (url === "/auth/login") {
        localStorage.setItem("id_token", data?.id_token);
        localStorage.setItem("access_token", data?.access_token);
        await getUserInfo();
      }
    }

    if (!res.ok) {
      // Parse error response
      const errorData = parseError(data);
      const userMessage =
        ERROR_MESSAGES[errorData.code] ||
        errorData.message ||
        `Error ${res.status}`;
      throw new ApiError(errorData.code, userMessage, errorData.field);
    }

    return data;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiError("NetworkError", ERROR_MESSAGES.NetworkError);
    }

    // Convert other errors to ApiError
    throw new ApiError(
      "ServerError",
      error.message || ERROR_MESSAGES.ServerError,
    );
  }
};

// 🔹 Global Token Expiry Handler — handles TokenExpired for all API calls
export const withTokenExpiry = async (apiPromise, authContext) => {
  try {
    return await apiPromise;
  } catch (error) {
    if (error instanceof ApiError && isSessionExpiredError(error.code)) {
      // Clear tokens
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");

      // Invalidate auth state and redirect to login
      if (authContext?.logout) {
        authContext.logout();
      }
      if (authContext?.goScreen) {
        authContext.goScreen("login");
      }

      // Re-throw the error so caller can also handle if needed
      throw error;
    }
    // Re-throw other errors
    throw error;
  }
};

// 🔹 Get User Info (uses access_token)
export const getUserInfo = async () => {
  const data = await fetchClient("/auth/me", { method: "GET" }, true);

  if (data?.sub) {
    localStorage.setItem("user_id", data.sub);
  }

  return data;
};

export const authApi = {
  /** Sign up a new user with password — { full_name, email, password } */
  signup: (payload) =>
    fetchClient("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Verify email after signup — { email, code } — requires ID token */
  verifyEmail: (payload) =>
    fetchClient("/auth/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Login with password — { email, password } */
  login: (payload) =>
    fetchClient("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Resend verification code — { email } */
  resendCode: (payload) =>
    fetchClient("/auth/resend", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** Get company_name/domain + has_profile — requires access_token (Cognito access token, not id_token) */
  getProfile: () => fetchClient("/auth/profile", { method: "GET" }, true),

  /** One-time profile completion for accounts missing company_name/domain — { company_name, domain } */
  setProfile: (payload) =>
    fetchClient("/auth/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    }, true),
};

// const BASE = "https://api.aeo-app.ai";

// async function post(path, body) {
//   const res = await fetch(`${BASE}${path}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(body),
//   });
//   const data = await res.json().catch(() => ({}));
//   if (!res.ok) throw new Error(data.detail || data.message || `Error ${res.status}`);
//   return data;
// }

// export const authApi = {
//   /** Sign up a new user — sends verification code to email */
//   signup: (payload) => post('/auth/register', payload),

//   /** Verify email after signup — { email, code } */
//   verifyEmail: (payload) => post('/auth/verify', payload),

//   /** Login — sends OTP to email */
//   login: (payload) => post('/auth/login', payload),

//   /** Verify login OTP — { email, code } */
//   verifyOTP: (payload) => post('/auth/login/verify', payload),

//   /** Resend verification / OTP code — { email, type: 'signup'|'login' } */
//   // resendCode: (payload) => post('/auth/login/verify', payload),
// };
