import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import logoAsset from "@/assets/global-tickets-logo.svg.asset.json";

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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_IN" && session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signIn() {
    setError(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        const msg = result.error instanceof Error ? result.error.message : String(result.error);
        setError(
          msg.toLowerCase().includes("nicht freigeschaltet") || msg.includes("42501")
            ? "Diese E-Mail-Adresse ist nicht freigeschaltet. Bitte beim Admin melden."
            : msg,
        );
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fehlgeschlagen.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-2 p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded bg-primary text-primary-foreground">
            <img src={logoAsset.url} alt="Global Tickets" className="h-6 w-6" />
          </div>
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
          Melde dich mit deinem Google-Konto an. Zugriff haben nur freigeschaltete
          Mitarbeiter.
        </p>

        <Button onClick={signIn} disabled={loading} className="w-full gap-2">
          <GoogleIcon className="h-4 w-4" />
          {loading ? "Weiterleitung …" : "Mit Google anmelden"}
        </Button>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1S8.69 6 12 6c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.83 3.43 14.62 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12S6.76 21.5 12 21.5c6.93 0 9.5-4.86 9.5-7.78 0-.52-.06-.91-.13-1.32H12z"/>
    </svg>
  );
}
