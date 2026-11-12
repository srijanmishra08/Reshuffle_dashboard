"use client";

import { useState } from "react";

export function AcceptForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/p/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ typedName: name }),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Something went wrong");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">
        To accept this scope, type your full name. This records your name, the time and your IP address.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        disabled={busy || name.trim().length < 2}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Accept scope
      </button>
    </form>
  );
}
