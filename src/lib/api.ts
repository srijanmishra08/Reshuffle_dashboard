/** Small fetch wrapper for the dashboard's own REST routes. Throws Error with a readable message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const json = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
    details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  };

  if (!response.ok) {
    const fieldMessages = Object.values(json.details?.fieldErrors ?? {}).flat();
    const message = [...(json.details?.formErrors ?? []), ...fieldMessages][0] ?? json.error ?? "Request failed";
    throw new Error(message);
  }

  return json.data as T;
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}
