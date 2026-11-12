"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { lifecycleStages, type Company, type Lifecycle } from "@/lib/crm-types";

type Props = {
  companies: Company[];
  onMove: (company: Company, to: Lifecycle) => Promise<void>;
};

export function LifecycleBoard({ companies, onMove }: Props) {
  const [overStage, setOverStage] = useState<Lifecycle | null>(null);

  function onDrop(stage: Lifecycle, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOverStage(null);
    const id = event.dataTransfer.getData("text/company-id");
    const company = companies.find((item) => item.id === id);
    if (company && company.lifecycle !== stage) {
      void onMove(company, stage);
    }
  }

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
      {lifecycleStages.map((stage) => {
        const items = companies.filter((company) => company.lifecycle === stage);
        return (
          <div
            key={stage}
            onDragOver={(event) => {
              event.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage(null)}
            onDrop={(event) => onDrop(stage, event)}
            className={`min-h-40 rounded-2xl border p-3 ${
              overStage === stage ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stage} <span className="font-normal">({items.length})</span>
            </p>
            <div className="mt-2 space-y-2">
              {items.map((company) => (
                <div
                  key={company.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/company-id", company.id)}
                  className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                >
                  <Link href={`/crm/${company.id}`} className="font-medium text-slate-900 hover:underline">
                    {company.name}
                  </Link>
                  {company.verticalName ? <p className="text-xs text-slate-500">{company.verticalName}</p> : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
