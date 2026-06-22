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
    if (lower.includes("nicht freigeschaltet") || msg.includes("42501")) {
      return "Diese E-Mail-Adresse ist nicht freigeschaltet. Bitte beim Admin melden.";
    }
    if (lower.includes("invalid login credentials")) {
      return "E-Mail oder Passwort ist falsch.";
    }
    if (lower.includes("user already registered")) {
      return "Es existiert bereits ein Konto mit dieser E-Mail. Bitte anmelden oder Passwort zurücksetzen.";
    }
    if (lower.includes("password should be")) {
      return "Das Passwort muss mindestens 6 Zeichen lang sein.";
    }
    if (lower.includes("pwned") || lower.includes("compromised")) {
      return "Dieses Passwort wurde in Datenleaks gefunden. Bitte ein anderes wählen.";
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
      setError(e instanceof Error ? translateError(e.message) : "Anmeldung fehlgeschlagen.");
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
        setInfo("Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen verschickt.");
      }
    } catch (e) {
      setError(e instanceof Error ? translateError(e.message) : "Anfrage fehlgeschlagen.");
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
          Zugriff haben nur freigeschaltete Mitarbeiter.
        </p>

        <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setError(null); setInfo(null); setShowReset(false); }}>

          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Anmelden</TabsTrigger>
            <TabsTrigger value="signup">Registrieren</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            {showReset ? (
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">E-Mail</Label>
                  <Input id="reset-email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Sende Link …" : "Link zum Zurücksetzen senden"}
                </Button>
                <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowReset(false); setError(null); setInfo(null); }}>
                  Zurück zur Anmeldung
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <EmailPasswordFields
                  email={email} setEmail={setEmail}
                  password={password} setPassword={setPassword}
                />
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Anmelden …" : "Anmelden"}
                </Button>
                <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowReset(true); setError(null); setInfo(null); }}>
                  Passwort vergessen?
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
                {loading ? "Konto wird erstellt …" : "Konto erstellen"}
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
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" type="password" autoComplete="current-password" required
          minLength={minLength}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
    </>
  );
}

