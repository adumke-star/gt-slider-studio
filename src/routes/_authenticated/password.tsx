import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/password")({
  head: () => ({ meta: [{ title: "Change password — Slider Studio" }] }),
  component: ChangePasswordPage,
});

function translateError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("pwned") || lower.includes("compromised")) {
    return "This password was found in a data breach. Please choose a different one.";
  }
  if (lower.includes("password should be")) {
    return "Password must be at least 6 characters.";
  }
  return msg;
}

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(translateError(err.message));
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-2/95">
        <div className="mx-auto flex max-w-md items-center gap-3 px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="ml-auto font-display text-lg font-black uppercase">Change password</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-8">
        <section className="rounded-lg border border-border bg-surface-2 p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Choose a new password for your account. You stay signed in after saving.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving…" : "Save password"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
