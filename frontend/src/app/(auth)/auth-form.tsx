"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { TryAsGuestButton } from "@/components/app/guest";
import { useLogin, useMe, useProviders, useSignup } from "@/lib/api/hooks";
import { safeNext } from "@/lib/next-url";

const OAUTH_ERRORS: Record<string, string> = {
  google_failed: "Google sign-in didn't complete. Try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_unverified: "Your Google account email isn't verified.",
  google_disabled: "Google sign-in isn't set up on this server.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-slate">{hint}</span>}
    </label>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const login = useLogin();
  const signup = useSignup();
  const providers = useProviders();
  const { data: me } = useMe();
  const guest = mode === "signup" && !!me?.isGuest;
  const pending = login.isPending || signup.isPending;
  const [error, setError] = useState<string | null>(() => OAUTH_ERRORS[params.get("error") ?? ""] ?? null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      if (mode === "login") await login.mutateAsync({ email, password });
      else await signup.mutateAsync({ email, password, name: String(form.get("name") ?? "") });
      router.replace(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const otherHref = `${mode === "login" ? "/signup" : "/login"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <div>
      <h1 className="display text-[40px]">
        {mode === "login" ? "Welcome back." : guest ? "Keep your work." : "Create your account."}
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-slate">
        {mode === "login"
          ? "Log in to open your projects and jams."
          : guest
            ? `You're working as ${me?.name}. Create an account and everything you made stays with you.`
            : "Model processes with your team. It takes a minute."}
      </p>

      {providers.data?.google && (
        <>
          <Button asChild variant="outline" size="lg" className="mt-8 w-full">
            <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
              <GoogleMark />
              Continue with Google
            </a>
          </Button>
          <div className="mt-6 flex items-center gap-3 text-[12px] text-slate">
            <span className="h-px flex-1 bg-hairline" />
            or with email
            <span className="h-px flex-1 bg-hairline" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={providers.data?.google ? "mt-6 flex flex-col gap-4" : "mt-8 flex flex-col gap-4"}>
        {mode === "signup" && (
          <Field label="Name">
            <Input name="name" autoComplete="name" required maxLength={200} placeholder="Your name" />
          </Field>
        )}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            placeholder="••••••••"
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-2xl bg-destructive/8 px-4 py-3 text-[14px] text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
          {pending && <Loader2 className="animate-spin" />}
          {mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[14px] text-slate">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={otherHref} className="font-medium text-ink underline-offset-4 hover:underline">
          {mode === "login" ? "Create an account" : "Log in"}
        </Link>
      </p>
      {!me && (
        <div className="mt-3 flex justify-center">
          <TryAsGuestButton
            variant="ghost"
            size="sm"
            className="text-slate hover:text-ink"
            next={params.get("next") ? next : undefined}
          >
            Just looking? Continue as a guest
          </TryAsGuestButton>
        </div>
      )}
    </div>
  );
}
