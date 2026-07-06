import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios"

const API_URL = import.meta.env.VITE_API_URL || "/api"

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

function getAuthTokens() {
  try {
    const raw = localStorage.getItem("ploutos-auth")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const tokens = getAuthTokens()
  if (tokens?.id_token && config.headers) {
    config.headers.Authorization = `Bearer ${tokens.id_token}`
  }
  return config
})

let isRefreshing = false

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    if (error.response?.status !== 401 || isRefreshing) {
      return Promise.reject(error)
    }
    const tokens = getAuthTokens()
    if (!tokens?.refresh_token) {
      localStorage.removeItem("ploutos-auth")
      window.location.href = "/auth/login"
      return Promise.reject(error)
    }
    isRefreshing = true
    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: tokens.refresh_token,
      })
      const updated = {
        ...tokens,
        access_token: data.access_token,
        ...(data.id_token ? { id_token: data.id_token } : {}),
      }
      localStorage.setItem("ploutos-auth", JSON.stringify(updated))
      if (error.config) {
        return api(error.config)
      }
    } catch {
      localStorage.removeItem("ploutos-auth")
      window.location.href = "/auth/login"
    } finally {
      isRefreshing = false
    }
    return Promise.reject(error)
  },
)

export default api
