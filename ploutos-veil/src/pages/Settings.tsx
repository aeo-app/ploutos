import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { ArrowRight, CheckCircle, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react"
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
import type { TokenResponse } from "@/types/api"
import { AxiosError } from "axios"

export default function Settings() {
  const { user, login } = useAuth()
  const email = user?.email || ""

  const [step, setStep] = useState<"send" | "reset">("send")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/auth/password/forgot", { email })
      return res.data
    },
    onSuccess: () => setStep("reset"),
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<TokenResponse>("/auth/password/reset", {
        email,
        code,
        new_password: newPassword,
      })
      return res.data
    },
    onSuccess: (tokens) => {
      login(tokens)
      setCode("")
      setNewPassword("")
      setConfirmPassword("")
    },
  })

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    sendMutation.mutate()
  }

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault()
    resetMutation.mutate()
  }

  const getError = (mutation: typeof sendMutation | typeof resetMutation) => {
    const err = mutation.error
    if (!err) return null
    if (err instanceof AxiosError) {
      return err.response?.data?.detail || "Something went wrong."
    }
    return "Something went wrong."
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account password.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Reset password
          </CardTitle>
          <CardDescription>
            A reset code will be sent to your email. Enter it along with your new password to set or
            change your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "send" ? (
            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    className="pl-9"
                    value={email}
                    readOnly
                  />
                </div>
              </div>
              <Button type="submit" disabled={sendMutation.isPending} className="w-full">
                {sendMutation.isPending ? "Sending…" : "Send reset code"}
                {!sendMutation.isPending && <ArrowRight className="ml-1 h-4 w-4" />}
              </Button>
              {sendMutation.isError && (
                <p className="text-sm text-destructive">{getError(sendMutation)}</p>
              )}
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter your new password"
                    className="pl-9"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-destructive">Passwords do not match.</p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setStep("send"); sendMutation.reset() }}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={
                    resetMutation.isPending ||
                    code.length < 4 ||
                    newPassword.length < 8 ||
                    newPassword !== confirmPassword
                  }
                >
                  {resetMutation.isPending ? "Resetting…" : "Reset password"}
                  {!resetMutation.isPending && <ShieldCheck className="ml-1 h-4 w-4" />}
                </Button>
              </div>
              {resetMutation.isSuccess && (
                <p className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  Password reset successfully.
                </p>
              )}
              {resetMutation.isError && (
                <p className="text-sm text-destructive">{getError(resetMutation)}</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
