"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-next";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);

    const callbackURL = safeNextPath(new URLSearchParams(window.location.search).get("next"));

    const result = await authClient.signIn.social({ provider: "google", callbackURL });

    if (result.error) {
      setError(result.error.message ?? "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">ReShuffle OS</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with your team Google account.</p>
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Redirecting..." : "Continue with Google"}
        </button>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <p className="mt-4 text-xs text-slate-400">Access is limited to allow-listed emails.</p>
      </div>
    </main>
  );
}
