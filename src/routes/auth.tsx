import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import budgeLogo from "@/assets/budge-logo.png";


export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — Budge" }] }),
  component: AuthPage,
});


function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Welcome.");
        navigate({ to: "/onboarding" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    if (!email) return toast.error("Enter your email first");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Check your inbox for a sign-in link.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send link");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message || "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-stretch">
      {/* Left panel — brand */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 bg-surface border-r border-border">
        <Link to="/auth" className="flex items-center gap-3">
          <img src={budgeLogo} alt="Budge logo" className="h-8 w-auto" />
          <span className="font-mono text-sm tracking-tight font-bold uppercase">Budge</span>
        </Link>
        <div className="space-y-6 max-w-md">
          <h1 className="text-5xl font-display font-extrabold tracking-tight leading-[0.95]">
            A calm view of your money.
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Track what comes in, what goes out, and get a real answer before you buy.
            No spreadsheets. No lecturing.
          </p>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          PRIVATE / ENCRYPTED / YOURS
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8 animate-enter">
          <div className="lg:hidden flex items-center gap-3">
            <img src={budgeLogo} alt="Budge logo" className="h-8 w-auto" />
            <span className="font-mono text-sm tracking-tight font-bold uppercase">Budge</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "signin" ? "Welcome back." : "Create your account."}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "signin" ? "Sign in to your private ledger." : "Set up in under a minute."}
            </p>
          </div>

          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 border border-border rounded-lg py-3 text-sm font-medium hover:bg-surface transition-colors disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full panel px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full panel px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full btn-accent py-3 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </button>
            <button
              onClick={handleMagicLink}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Email me a link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
