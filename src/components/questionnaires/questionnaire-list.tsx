"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { defaultQuestions } from "@/lib/schemas/questionnaires";

type Row = { id: string; title: string; status: "OPEN" | "CLOSED"; companyName: string | null; createdAt: string; responses: number };

export function QuestionnaireList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [title, setTitle] = useState("Client onboarding");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Row[]>("/api/questionnaires")
        .then(setRows)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load questionnaires"));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/api/questionnaires", {
        method: "POST",
        ...jsonBody({ title, questions: defaultQuestions() }),
      });
      router.push(`/questionnaires/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the questionnaire");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="min-w-64 flex-1 text-xs text-slate-500">
          New questionnaire title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Create with starter questions
        </button>
      </form>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Responses</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-slate-500">Loading...</td>
              </tr>
            ) : null}
            {rows?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-slate-500">No questionnaires yet. Create one above.</td>
              </tr>
            ) : null}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <Link href={`/questionnaires/${r.id}`} className="font-medium text-slate-900 hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.companyName ?? "—"}</td>
                <td className="px-3 py-2">{r.status === "OPEN" ? "Open" : "Closed"}</td>
                <td className="px-3 py-2 text-right">{r.responses}</td>
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
