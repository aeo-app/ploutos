import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { KeyRound, Loader2 } from "lucide-react"
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
import type { VerifyRequest, TokenResponse } from "@/types/api"

export default function Verify() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") || ""
  const [code, setCode] = useState("")
  const { login } = useAuth()

  const mutation = useMutation({
    mutationFn: async (data: VerifyRequest) => {
      const res = await api.post<TokenResponse | { message: string; email: string }>(
        "/auth/verify",
        data,
      )
      return res.data
    },
    onSuccess: (data) => {
      if ("access_token" in data) {
        login(data)
        navigate("/dashboard")
      } else {
        navigate("/auth/login")
      }
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
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            We sent a verification code to{" "}
            <span className="font-medium text-foreground">{email}</span>.
            Enter it below to confirm your account.
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
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify email"
              )}
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
