import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Settings, LogOut, Sparkles, Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { useAuth, logout } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Authenticated page frame: top nav + hero background. Redirects to / when signed out. */
export function AppShell({ children }: { children: (user: User) => ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-hero">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-hero">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl" />
      </div>

      <header className="relative border-b border-border/40 bg-surface/30 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight">Sublet</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavLink to="/settings" icon={Settings} label="Settings" />
            <div className="mx-3 hidden h-5 w-px bg-border sm:block" />
            <span className="mr-2 hidden max-w-48 truncate text-xs text-muted-foreground sm:block">
              {user.email}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => logout()}
                  aria-label="Sign out"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
        {children(user)}
      </main>
    </div>
  );
}

function NavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeProps={{ className: "bg-surface-elevated text-foreground" }}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
