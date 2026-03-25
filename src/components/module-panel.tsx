type ModulePanelProps = {
  label: string;
  points: string[];
};

export function ModulePanel({ label, points }: ModulePanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">{label}</h3>
      <ul className="mt-3 space-y-2">
        {points.map((point) => (
          <li key={point} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}
