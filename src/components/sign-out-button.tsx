"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signOut().then(() => {
          window.location.href = "/login";
        });
      }}
      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
    >
      Sign out
    </button>
  );
}
