import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { KeyRound, Lock, ShieldCheck } from "lucide-react"
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
import type { ResetPasswordRequest, TokenResponse } from "@/types/api"

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") || ""
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const { login } = useAuth()

  const mutation = useMutation({
    mutationFn: async (data: ResetPasswordRequest) => {
      const res = await api.post<TokenResponse>("/auth/password/reset", data)
      return res.data
    },
    onSuccess: (tokens) => {
      login(tokens)
      navigate("/dashboard")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({ email, code, new_password: newPassword })
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set new password</CardTitle>
          <CardDescription>
            A reset code was sent to{" "}
            <span className="font-medium text-foreground">{email}</span>.
            Enter it below along with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Reset code</Label>
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
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="At least 8 characters"
                  className="pl-9"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || code.length < 4 || newPassword.length < 8}
            >
              {mutation.isPending ? "Resetting…" : "Reset password"}
              {!mutation.isPending && <ShieldCheck className="ml-1 h-4 w-4" />}
            </Button>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                {(mutation.error as any)?.response?.data?.detail ||
                  "Password reset failed. Please try again."}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
