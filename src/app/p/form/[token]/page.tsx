import { getDb } from "@/server/db/client";
import { getPublicQuestionnaire } from "@/server/services/questionnaires";
import { PublicForm } from "./public-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Questionnaire", robots: { index: false, follow: false } };

export default async function PublicQuestionnairePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getPublicQuestionnaire(getDb(), token);

  if (!result.ok || !result.data.open) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{result.ok ? "This form is closed" : "This link is not valid"}</h1>
        <p className="mt-2 text-sm text-slate-600">Please ask us for a new link.</p>
      </main>
    );
  }

  const { title, description, questions } = result.data;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500">Reshuffle</p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      {description ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{description}</p> : null}
      <PublicForm token={token} questions={questions} />
    </main>
  );
}
