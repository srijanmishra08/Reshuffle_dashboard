import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string; role: string; orgId: string } }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ NextResponse: { json: () => ({}) } }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => (state.user ? { user: state.user } : null) } }),
}));

vi.mock("@/server/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/session-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/session-user")>();
  // The allowlist lookup has its own tests (session-user.test.ts); here the session is trusted as given.
  return {
    ...original,
    resolveSessionUser: async (_db: unknown, raw: { id: string; email: string; name: string; role?: string; orgId?: string; active?: boolean }) =>
      raw.active === false ? null : { id: raw.id, email: raw.email, name: raw.name, role: raw.role, orgId: raw.orgId ?? "default" },
  };
});

import { requirePageRole } from "@/server/authz";

const user = (role: string) => ({ id: "u", email: "a@example.test", name: "A", role, orgId: "default" });

describe("requirePageRole", () => {
  beforeEach(() => {
    state.user = null;
  });

  it("redirects signed-out visitors to login with a return path", async () => {
    await expect(requirePageRole(["ADMIN"], "/settings")).rejects.toThrow("REDIRECT:/login?next=%2Fsettings");
  });

  it("returns null for a signed-in user with the wrong role", async () => {
    for (const role of ["MANAGER", "MEMBER", "FREELANCER"]) {
      state.user = user(role);
      expect(await requirePageRole(["ADMIN"], "/settings")).toBeNull();
    }
  });

  it("returns the user when the role is allowed", async () => {
    state.user = user("ADMIN");
    expect((await requirePageRole(["ADMIN"], "/settings"))?.role).toBe("ADMIN");
  });
});
