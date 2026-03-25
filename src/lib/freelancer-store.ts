const STORAGE_KEY = "dashboard_freelancer_names";

const DEFAULTS = ["Priya R", "Aman S", "Disha T"];

export function loadFreelancerNames(): string[] {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return (parsed as string[]).filter((n) => typeof n === "string" && n.trim());
      }
    }
  } catch {
    // ignore
  }
  return DEFAULTS;
}

export function saveFreelancerNames(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names.filter((n) => n.trim())));
  } catch {
    // ignore
  }
}
