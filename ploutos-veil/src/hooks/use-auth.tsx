import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import api from "@/lib/api"
import type { TokenResponse, UserResponse } from "@/types/api"

interface AuthContextType {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (tokens: TokenResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function storeTokens(tokens: TokenResponse) {
  localStorage.setItem(
    "ploutos-auth",
    JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
    }),
  )
}

function clearTokens() {
  localStorage.removeItem("ploutos-auth")
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const tokens = localStorage.getItem("ploutos-auth")
    if (!tokens) {
      setIsLoading(false)
      return
    }
    api
      .get<UserResponse>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false))
  }, [])

  const login = (tokens: TokenResponse) => {
    storeTokens(tokens)
    try {
      const payload = JSON.parse(atob(tokens.id_token!.split(".")[1]))
      setUser({ sub: payload.sub, email: payload.email, name: payload.name })
    } catch {}
    api
      .get<UserResponse>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {})
  }

  const logout = () => {
    clearTokens()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
