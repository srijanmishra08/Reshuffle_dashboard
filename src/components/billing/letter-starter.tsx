"use client";

import { useState } from "react";
import {
  type AgreementInstalment,
  type IpOption,
  type LetterDraftText,
  instalmentTotal,
  offerLetterText,
  serviceAgreementText,
} from "@/lib/letter-templates";

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";
const field = "space-y-1 text-sm";

type Kind = "blank" | "offer" | "agreement";

const kinds: { key: Kind; title: string; hint: string }[] = [
  { key: "blank", title: "Blank letter", hint: "Write it yourself" },
  { key: "offer", title: "Offer letter", hint: "Job offer with role and pay" },
  { key: "agreement", title: "Service agreement", hint: "Scope, timeline, payment, terms" },
];

/**
 * Forms that write the subject and body of a new letter. The result is ordinary letter text,
 * so it can be edited before saving and is issued, numbered and printed like any other letter.
 */
export function LetterStarter({
  clientName,
  onFill,
}: {
  clientName: string;
  onFill: (text: LetterDraftText, recipientName?: string) => void;
}) {
  const [kind, setKind] = useState<Kind>("blank");
  const [error, setError] = useState("");

  const [offer, setOffer] = useState({
    candidateName: "",
    position: "",
    startDate: "",
    employmentType: "full-time",
    responsibilities: "",
    reportsTo: "",
    monthlyPay: "",
  });

  const [sa, setSa] = useState({
    clientName: "",
    projectTitle: "",
    description: "",
    deliverables: "",
    exclusions: "",
    startDate: "",
    endDate: "",
    totalFee: "",
    gstExtra: true,
    revisionRounds: "2",
    ip: "full" as IpOption,
    lateFeePercent: "",
    cancellationFeePercent: "",
    jurisdiction: "Raipur, Chhattisgarh",
    extraClauses: "",
  });
  const [instalments, setInstalments] = useState<{ label: string; percent: string }[]>([
    { label: "Advance on signing", percent: "50" },
    { label: "On first delivery", percent: "30" },
    { label: "On completion", percent: "20" },
  ]);

  const parsedInstalments: AgreementInstalment[] = instalments.map((i) => ({ label: i.label, percent: Number(i.percent) || 0 }));
  const scheduleTotal = instalmentTotal(parsedInstalments);

  function fillOffer() {
    const pay = Number(offer.monthlyPay);
    if (!offer.candidateName.trim() || !offer.position.trim() || !offer.startDate) return setError("Fill in the name, position and start date.");
    if (!Number.isFinite(pay) || pay <= 0) return setError("Enter the monthly pay in rupees.");
    setError("");
    onFill(offerLetterText({ ...offer, monthlyPayRupees: pay }), offer.candidateName.trim());
  }

  function fillAgreement() {
    const fee = Number(sa.totalFee);
    const client = sa.clientName.trim() || clientName.trim();
    if (!client || !sa.projectTitle.trim() || !sa.description.trim()) return setError("Fill in the client, project title and description.");
    if (!sa.startDate || !sa.endDate) return setError("Choose the start and end dates.");
    if (sa.endDate <= sa.startDate) return setError("End date must be after the start date.");
    if (!Number.isFinite(fee) || fee <= 0) return setError("Enter the total fee in rupees.");
    if (scheduleTotal !== 100) return setError(`Payment schedule adds up to ${scheduleTotal}%. It must be 100%.`);
    setError("");
    onFill(
      serviceAgreementText({
        providerName: "Reshuffle",
        clientName: client,
        projectTitle: sa.projectTitle,
        description: sa.description,
        deliverables: sa.deliverables,
        exclusions: sa.exclusions,
        startDate: sa.startDate,
        endDate: sa.endDate,
        totalFeeRupees: fee,
        gstExtra: sa.gstExtra,
        instalments: parsedInstalments,
        revisionRounds: Math.max(0, Math.round(Number(sa.revisionRounds) || 0)),
        ip: sa.ip,
        lateFeePercent: Number(sa.lateFeePercent) || 0,
        cancellationFeePercent: Number(sa.cancellationFeePercent) || 0,
        jurisdiction: sa.jurisdiction,
        extraClauses: sa.extraClauses,
      }),
      client
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className={label}>Start from</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                setKind(k.key);
                setError("");
              }}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${kind === k.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}
            >
              <span className="block font-medium">{k.title}</span>
              <span className={`block text-xs ${kind === k.key ? "text-slate-300" : "text-slate-500"}`}>{k.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {kind === "offer" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={field}>
            <span className={label}>Candidate name</span>
            <input className={input} value={offer.candidateName} onChange={(e) => setOffer({ ...offer, candidateName: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Position</span>
            <input className={input} value={offer.position} onChange={(e) => setOffer({ ...offer, position: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Start date</span>
            <input type="date" className={input} value={offer.startDate} onChange={(e) => setOffer({ ...offer, startDate: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Type</span>
            <select className={input} value={offer.employmentType} onChange={(e) => setOffer({ ...offer, employmentType: e.target.value })}>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="internship">Internship</option>
              <option value="contract">Contract</option>
            </select>
          </label>
          <label className={`${field} md:col-span-2`}>
            <span className={label}>Responsibilities (completes “you will …”)</span>
            <textarea rows={2} className={input} value={offer.responsibilities} onChange={(e) => setOffer({ ...offer, responsibilities: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Reports to</span>
            <input className={input} value={offer.reportsTo} onChange={(e) => setOffer({ ...offer, reportsTo: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Monthly pay (₹)</span>
            <input type="number" min="1" className={input} value={offer.monthlyPay} onChange={(e) => setOffer({ ...offer, monthlyPay: e.target.value })} />
          </label>
          <div className="md:col-span-2">
            <button type="button" onClick={fillOffer} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Write offer letter
            </button>
          </div>
        </div>
      ) : null}

      {kind === "agreement" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className={field}>
            <span className={label}>Client name</span>
            <input className={input} placeholder={clientName || ""} value={sa.clientName} onChange={(e) => setSa({ ...sa, clientName: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Project title</span>
            <input className={input} value={sa.projectTitle} onChange={(e) => setSa({ ...sa, projectTitle: e.target.value })} />
          </label>
          <label className={`${field} md:col-span-2`}>
            <span className={label}>Scope of work</span>
            <textarea rows={3} className={input} value={sa.description} onChange={(e) => setSa({ ...sa, description: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Deliverables (one per line)</span>
            <textarea rows={4} className={input} value={sa.deliverables} onChange={(e) => setSa({ ...sa, deliverables: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Not included (one per line)</span>
            <textarea rows={4} className={input} value={sa.exclusions} onChange={(e) => setSa({ ...sa, exclusions: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Start date</span>
            <input type="date" className={input} value={sa.startDate} onChange={(e) => setSa({ ...sa, startDate: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>End date</span>
            <input type="date" className={input} value={sa.endDate} onChange={(e) => setSa({ ...sa, endDate: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Total fee (₹)</span>
            <input type="number" min="1" className={input} value={sa.totalFee} onChange={(e) => setSa({ ...sa, totalFee: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={sa.gstExtra} onChange={(e) => setSa({ ...sa, gstExtra: e.target.checked })} />
            GST is charged on top of the fee
          </label>

          <div className="space-y-2 md:col-span-2">
            <p className={label}>
              Payment schedule <span className={scheduleTotal === 100 ? "text-emerald-700" : "text-rose-600"}>({scheduleTotal}% of 100%)</span>
            </p>
            {instalments.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                <input
                  className={input}
                  aria-label={`Instalment ${i + 1} label`}
                  value={row.label}
                  onChange={(e) => setInstalments(instalments.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={input}
                  aria-label={`Instalment ${i + 1} percent`}
                  value={row.percent}
                  onChange={(e) => setInstalments(instalments.map((r, j) => (j === i ? { ...r, percent: e.target.value } : r)))}
                />
                <button type="button" onClick={() => setInstalments(instalments.filter((_, j) => j !== i))} className="px-2 text-sm text-slate-600 underline">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setInstalments([...instalments, { label: "", percent: "" }])} className="text-sm text-slate-700 underline">
              Add instalment
            </button>
          </div>

          <label className={field}>
            <span className={label}>Revision rounds (0 = unlimited)</span>
            <input type="number" min="0" className={input} value={sa.revisionRounds} onChange={(e) => setSa({ ...sa, revisionRounds: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Ownership of the work</span>
            <select className={input} value={sa.ip} onChange={(e) => setSa({ ...sa, ip: e.target.value as IpOption })}>
              <option value="full">Transfers to client on full payment</option>
              <option value="licensed">Client gets a licence, we keep ownership</option>
              <option value="shared">Shared ownership</option>
            </select>
          </label>
          <label className={field}>
            <span className={label}>Late fee (% per month, optional)</span>
            <input type="number" min="0" className={input} value={sa.lateFeePercent} onChange={(e) => setSa({ ...sa, lateFeePercent: e.target.value })} />
          </label>
          <label className={field}>
            <span className={label}>Cancellation fee (%, optional)</span>
            <input type="number" min="0" className={input} value={sa.cancellationFeePercent} onChange={(e) => setSa({ ...sa, cancellationFeePercent: e.target.value })} />
          </label>
          <label className={`${field} md:col-span-2`}>
            <span className={label}>Courts with jurisdiction</span>
            <input className={input} value={sa.jurisdiction} onChange={(e) => setSa({ ...sa, jurisdiction: e.target.value })} />
          </label>
          <label className={`${field} md:col-span-2`}>
            <span className={label}>Extra clauses (one per line, optional)</span>
            <textarea rows={3} className={input} value={sa.extraClauses} onChange={(e) => setSa({ ...sa, extraClauses: e.target.value })} />
          </label>
          <div className="md:col-span-2">
            <button type="button" onClick={fillAgreement} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Write service agreement
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
