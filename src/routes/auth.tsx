import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

import logoUrl from "@/assets/global-tickets-logo.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Login — Slider Studio" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" && session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  function translateError(msg: string): string {
    const lower = msg.toLowerCase();
    if (lower.includes("nicht freigeschaltet") || lower.includes("not allowlisted") || msg.includes("42501")) {
      return "This email address is not allowlisted. Please contact an admin.";
    }
    if (lower.includes("invalid login credentials")) {
      return "Incorrect email or password.";
    }
    if (lower.includes("user already registered")) {
      return "An account with this email already exists. Please sign in or reset your password.";
    }
    if (lower.includes("password should be")) {
      return "Password must be at least 6 characters.";
    }
    if (lower.includes("pwned") || lower.includes("compromised")) {
      return "This password was found in a data breach. Please choose a different one.";
    }
    return msg;
  }


  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(translateError(err.message));
          setLoading(false);
        }
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) {
          setError(translateError(err.message));
          setLoading(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : "Sign-in failed.");
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) {
        setError(translateError(err.message));
      } else {
        setInfo("If an account exists for this email, a reset link has been sent.");
      }
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-2 p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <img src={logoUrl} alt="Global Tickets" className="h-9 w-auto" />
          <div>
            <h1 className="font-display text-lg font-black uppercase leading-none">
              Slider <span className="text-primary">Studio</span>
            </h1>
            <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              Login
            </p>
          </div>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Access is limited to allowlisted team members.
        </p>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setError(null); setInfo(null); setShowReset(false); }}>

          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            {showReset ? (
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sending link…" : "Send reset link"}
                </Button>
                <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowReset(false); setError(null); setInfo(null); }}>
                  Back to sign in
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <EmailPasswordFields
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
                <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowReset(true); setError(null); setInfo(null); }}>
                  Forgot password?
                </button>
              </form>
            )}
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <EmailPasswordFields
                email={email} setEmail={setEmail}
                password={password} setPassword={setPassword}
                minLength={8}
              />
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-4 rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
            {info}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailPasswordFields({
  email, setEmail, password, setPassword, minLength = 6,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  minLength?: number;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" required
          minLength={minLength}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
    </>
  );
}
