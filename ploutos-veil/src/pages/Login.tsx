import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, KeyRound, Lock, LogIn, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import api from "@/lib/api"
import type { OtpRequest, PasswordLoginRequest, TokenResponse } from "@/types/api"

type Mode = "otp" | "password"

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [mode, setMode] = useState<Mode>("otp")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const otpMutation = useMutation({
    mutationFn: async (data: OtpRequest) => {
      const res = await api.post("/auth/login", data)
      return res.data
    },
    onSuccess: () => {
      navigate(`/auth/login/verify?email=${encodeURIComponent(email)}`)
    },
  })

  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordLoginRequest) => {
      const res = await api.post<TokenResponse>("/auth/login/password", data)
      return res.data
    },
    onSuccess: (tokens) => {
      login(tokens)
      navigate("/dashboard")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === "otp") {
      otpMutation.mutate({ email })
    } else {
      passwordMutation.mutate({ email, password })
    }
  }

  const isPending = otpMutation.isPending || passwordMutation.isPending
  const error = otpMutation.error || passwordMutation.error

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            {mode === "otp"
              ? "Enter your email to receive a verification code."
              : "Sign in with your email and password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setMode("otp")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "otp"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              OTP
            </button>
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "password"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Lock className="h-4 w-4" />
              Password
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {mode === "password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? "Please wait…"
                : mode === "otp"
                  ? "Send code"
                  : "Sign in"}
              {!isPending &&
                (mode === "otp" ? (
                  <ArrowRight className="ml-1 h-4 w-4" />
                ) : (
                  <LogIn className="ml-1 h-4 w-4" />
                ))}
            </Button>

            {mode === "password" && (
              <div className="text-center">
                <Link
                  to="/auth/password/forgot"
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">
                {(error as any)?.response?.data?.detail ||
                  "Failed to sign in. Please try again."}
              </p>
            )}
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link
              to="/auth/register"
              className="font-medium text-primary hover:underline"
            >
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
