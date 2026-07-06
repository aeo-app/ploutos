import { Link, Outlet, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { ArrowRight } from "lucide-react"

export default function PublicLayout() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const isLanding = location.pathname === "/"
  const isFullWidth = location.pathname === "/" || location.pathname === "/offers" || location.pathname === "/contact" || location.pathname === "/report"

  return (
    <div className="min-h-screen bg-background">
      {!isLanding && (
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a2540]/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[#635bff] text-sm font-bold">
                A
              </span>
              AEO-App<span className="text-white/50">.ai</span>
            </Link>

            <nav className="flex items-center gap-2">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  className="inline-flex h-9 items-center rounded-full bg-[#635bff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5851e8]"
                >
                  Dashboard
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth/login"
                    className="rounded-full px-4 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/auth/register"
                    className="inline-flex h-9 items-center rounded-full bg-[#635bff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#5851e8]"
                  >
                    Get started
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
      )}

      <main className={cn(isFullWidth ? "" : "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8")}>
        <Outlet />
      </main>
    </div>
  )
}
