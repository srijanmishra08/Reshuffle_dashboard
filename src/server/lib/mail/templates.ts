const signOff = () => process.env.NEXT_PUBLIC_APP_NAME || "ReShuffle";

export function appBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function portalInvite(input: { role: string }): { subject: string; body: string } {
  const portal = input.role === "CLIENT" ? "client portal" : input.role === "AGENCY" ? "partner portal" : input.role === "FREELANCER" ? "freelancer portal" : "dashboard";
  return {
    subject: `You have been invited to the ${signOff()} ${portal}`,
    body: [
      `Hello,`,
      ``,
      `You now have access to the ${signOff()} ${portal}.`,
      ``,
      `Sign in with this Google account here:`,
      `${appBaseUrl()}/login`,
      ``,
      `If you were not expecting this, you can ignore this email.`,
      ``,
      `${signOff()}`,
    ].join("\n"),
  };
}

export function scopeLink(input: { path: string; title?: string | null }): { subject: string; body: string } {
  return {
    subject: input.title ? `Scope of work: ${input.title}` : "Your scope of work",
    body: [
      `Hello,`,
      ``,
      `Please review and accept the scope of work${input.title ? ` for ${input.title}` : ""} here:`,
      `${appBaseUrl()}${input.path}`,
      ``,
      `The link stays open for 30 days. Reply to this email if you have any questions.`,
      ``,
      `${signOff()}`,
    ].join("\n"),
  };
}

export type DigestItem = { label: string; detail: string; when: string };

export function followUpDigest(input: { date: string; items: DigestItem[] }): { subject: string; body: string } {
  const lines = input.items.map((i) => `- ${i.label}: ${i.detail} (${i.when})`);
  return {
    subject: `Follow-ups due: ${input.items.length} on ${input.date}`,
    body: [`Follow-ups due today or overdue:`, ``, ...lines, ``, `Open the dashboard: ${appBaseUrl()}/crm`].join("\n"),
  };
}
