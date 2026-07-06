import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import {
  KeyRound, LogIn
} from "lucide-react"
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
import type { OtpVerifyRequest, TokenResponse } from "@/types/api"

export default function LoginVerify() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") || ""
  const [code, setCode] = useState("")
  const { login } = useAuth()

  const mutation = useMutation({
    mutationFn: async (data: OtpVerifyRequest) => {
      const res = await api.post<TokenResponse>("/auth/login/verify", data)
      return res.data
    },
    onSuccess: (tokens) => {
      login(tokens)
      navigate("/dashboard")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ email, code })
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Enter code</CardTitle>
          <CardDescription>
            A verification code was sent to{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="code"
                  placeholder="000000"
                  className="pl-9 text-center text-lg tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || code.length < 4}
            >
              {mutation.isPending ? "Verifying…" : "Sign in"}
              {!mutation.isPending && <LogIn className="ml-1 h-4 w-4" />}
            </Button>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {(mutation.error as any)?.response?.data?.detail ||
                  "Verification failed. Please try again."}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
