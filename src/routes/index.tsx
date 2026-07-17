import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Mail, Lock, User, ArrowRight, Check, Sparkles,
  CreditCard, Bell, TrendingDown, Shield,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signup");

  return (
    <main className="relative min-h-screen bg-hero overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
        <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-accent/15 blur-3xl animate-pulse-glow" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-12 px-6 py-10 lg:grid-cols-2 lg:gap-16 lg:px-10">
        {/* LEFT — brand pitch */}
        <section className="flex flex-col justify-between">
          <header className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight">Sublet</span>
          </header>

          <div className="mt-14 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Now tracking $2.4M in subscriptions
            </div>

            <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Every subscription.
              <br />
              <em className="text-primary">One quiet</em> place.
            </h1>

            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              Connect your bank or Gmail — we surface every recurring charge, categorize it,
              and nudge you before the next bill hits.
            </p>

            <ul className="mt-10 space-y-4">
              {[
                { icon: CreditCard, title: "Auto-detected", desc: "Bank & Gmail scanning finds subscriptions you forgot." },
                { icon: Bell, title: "Gentle reminders", desc: "Email alerts a few days before every renewal." },
                { icon: TrendingDown, title: "Spending clarity", desc: "Monthly & yearly totals by category, at a glance." },
              ].map((f) => (
                <li key={f.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface-elevated/60 backdrop-blur">
                    <f.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{f.title}</p>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <footer className="mt-14 flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Bank-grade encryption · Read-only access · SOC 2
          </footer>
        </section>

        {/* RIGHT — auth card */}
        <section className="flex items-center">
          <div className="w-full">
            <div className="relative rounded-3xl border border-border/60 bg-card-gradient p-8 shadow-elegant backdrop-blur-xl sm:p-10">
              {/* Tabs */}
              <div className="mb-8 flex rounded-full border border-border/60 bg-surface/60 p-1">
                {(["signup", "signin"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`relative flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      mode === m
                        ? "bg-gradient-primary text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "signup" ? "Create account" : "Sign in"}
                  </button>
                ))}
              </div>

              <h2 className="font-display text-3xl tracking-tight text-foreground">
                {mode === "signup" ? "Start tracking in minutes." : "Welcome back."}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Free forever. No card required."
                  : "Pick up right where you left off."}
              </p>

              <AuthForm mode={mode} />

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or continue with
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SocialButton provider="google" />
                <SocialButton provider="apple" />
              </div>

              <p className="mt-8 text-center text-xs text-muted-foreground">
                By continuing you agree to our{" "}
                <a href="#" className="underline underline-offset-4 hover:text-foreground">Terms</a>{" "}
                and{" "}
                <a href="#" className="underline underline-offset-4 hover:text-foreground">Privacy</a>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthForm({ mode }: { mode: Mode }) {
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 900);
  };

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      {mode === "signup" && (
        <Field icon={User} type="text" placeholder="Full name" autoComplete="name" />
      )}
      <Field icon={Mail} type="email" placeholder="you@domain.com" autoComplete="email" />
      <Field
        icon={Lock}
        type="password"
        placeholder={mode === "signup" ? "Create a strong password" : "Password"}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
      />

      {mode === "signin" && (
        <div className="flex items-center justify-between text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-border bg-input accent-primary" />
            Remember me
          </label>
          <a href="#" className="text-primary hover:text-primary-glow">Forgot password?</a>
        </div>
      )}

      {mode === "signup" && (
        <ul className="grid grid-cols-2 gap-2 pt-1 text-xs text-muted-foreground">
          {["8+ characters", "One number", "One symbol", "One uppercase"].map((r) => (
            <li key={r} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-primary" /> {r}
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
      >
        <span>{mode === "signup" ? "Create my account" : "Sign in"}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </form>
  );
}

function Field({
  icon: Icon, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <label className="group relative block">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <input
        {...props}
        className="h-12 w-full rounded-2xl border border-border/60 bg-input/60 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary/60 focus:bg-input focus:ring-2 focus:ring-primary/25"
      />
    </label>
  );
}

function SocialButton({ provider }: { provider: "google" | "apple" }) {
  const label = provider === "google" ? "Google" : "Apple";
  return (
    <button
      type="button"
      className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-surface/60 px-4 py-3 text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-surface-elevated"
    >
      {provider === "google" ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
        </svg>
      ) : (
        <svg className="h-4 w-4 text-foreground" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16.365 12.86c-.02-2.13 1.74-3.15 1.82-3.2-1-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.56.77-3.23.77-.67 0-1.7-.75-2.79-.73-1.43.02-2.76.83-3.5 2.11-1.49 2.58-.38 6.4 1.07 8.5.71 1.03 1.55 2.18 2.65 2.14 1.06-.04 1.46-.69 2.75-.69 1.28 0 1.65.69 2.78.67 1.15-.02 1.87-1.04 2.57-2.08.81-1.2 1.14-2.36 1.16-2.42-.03-.01-2.22-.85-2.24-3.4zM14.3 6.2c.58-.71.97-1.68.86-2.66-.83.04-1.85.56-2.45 1.26-.54.62-1.01 1.63-.88 2.58.93.07 1.88-.47 2.47-1.18z"/>
        </svg>
      )}
      {label}
    </button>
  );
}
