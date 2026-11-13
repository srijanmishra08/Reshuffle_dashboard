/// <reference types="vite/client" />
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";

const state = vi.hoisted(() => ({
  db: null as unknown,
  session: null as null | { user: Record<string, unknown> },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => state.session } }),
}));
vi.mock("@/server/session-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/session-user")>();
  // The allowlist lookup has its own tests (session-user.test.ts); here the session is trusted as given.
  return {
    ...original,
    resolveSessionUser: async (_db: unknown, raw: { id: string; email: string; name: string; role?: string; orgId?: string; active?: boolean }) =>
      raw.active === false ? null : { id: raw.id, email: raw.email, name: raw.name, role: raw.role, orgId: raw.orgId ?? "default" },
  };
});
vi.mock("@/server/db/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/db/client")>();
  return { ...original, getDb: () => state.db };
});

type Handler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// Every API route except Better Auth's own catch-all and the public health check.
const loaders = import.meta.glob<Record<string, unknown>>("/src/app/api/**/route.ts");
// Public by design: Better Auth's catch-all, the health check, the cron route (gated by
// CRON_SECRET, not by a session) and the client-facing scope accept route (gated by an
// unguessable share token and rate limited per IP).
const PUBLIC = [
  "/src/app/api/auth/",
  "/src/app/api/health/",
  "/src/app/api/cron/",
  "/src/app/api/p/",
];
const ADMIN_ONLY_FILES = ["/src/app/api/settings/route.ts"];

function signIn(role: string, orgId = "default") {
  state.session = { user: { id: `${role}-${orgId}`, email: "x@example.test", name: "X", role, orgId, active: true } };
}

function paramsFor(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, key] of file.matchAll(/\[(\w+)\]/g)) {
    out[key] = "does-not-exist";
  }
  return out;
}

function call(handler: Handler, method: string, file: string, body?: unknown) {
  const request = new NextRequest("http://localhost/api/test", {
    method,
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  return handler(request, { params: Promise.resolve(paramsFor(file)) });
}

let db: Db;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  state.db = db;
});
afterAll(() => cleanup());
beforeEach(() => {
  state.session = null;
});

const guardedRoutes = Object.keys(loaders).filter((file) => !PUBLIC.some((p) => file.startsWith(p)));

describe("route guards", () => {
  it("discovers the API routes", () => {
    expect(guardedRoutes.length).toBeGreaterThan(15);
  });

  for (const file of guardedRoutes) {
    describe(file.replace("/src/app/api", ""), () => {
      for (const method of METHODS) {
        it(`${method}: 401 signed out, 403 for freelancers${ADMIN_ONLY_FILES.includes(file) ? " and non-admins" : ""}`, async () => {
          const mod = await loaders[file]();
          const handler = mod[method] as Handler | undefined;
          if (!handler) return;

          state.session = null;
          expect((await call(handler, method, file, {})).status).toBe(401);

          const blocked = ADMIN_ONLY_FILES.includes(file) ? ["FREELANCER", "MEMBER", "MANAGER"] : ["FREELANCER"];
          for (const role of blocked) {
            signIn(role);
            expect((await call(handler, method, file, {})).status, `${role} on ${method}`).toBe(403);
          }
        });
      }
    });
  }

  it("treats a deactivated user as signed out", async () => {
    const { GET } = (await loaders["/src/app/api/companies/route.ts"]()) as { GET: Handler };
    state.session = { user: { id: "u", email: "x@example.test", name: "X", role: "ADMIN", orgId: "default", active: false } };
    expect((await call(GET, "GET", "/src/app/api/companies/route.ts")).status).toBe(401);
  });
});

describe("validation, not found and org isolation", () => {
  it("returns 400 for an invalid company and 404 for an unknown one", async () => {
    const companies = (await loaders["/src/app/api/companies/route.ts"]()) as { POST: Handler };
    const company = (await loaders["/src/app/api/companies/[id]/route.ts"]()) as { GET: Handler };
    const file = "/src/app/api/companies/[id]/route.ts";

    signIn("MEMBER");
    expect((await call(companies.POST, "POST", "/src/app/api/companies/route.ts", { name: "" })).status).toBe(400);
    expect((await call(company.GET, "GET", file)).status).toBe(404);
  });

  it("does not show one org's company to another org", async () => {
    const companies = (await loaders["/src/app/api/companies/route.ts"]()) as { POST: Handler; GET: Handler };
    const company = (await loaders["/src/app/api/companies/[id]/route.ts"]()) as { GET: Handler; PATCH: Handler; DELETE: Handler };
    const listFile = "/src/app/api/companies/route.ts";

    signIn("ADMIN", "org-a");
    const created = await call(companies.POST, "POST", listFile, { name: "Isolation Test Co" });
    expect(created.status).toBeLessThan(300);
    const { data } = (await created.json()) as { data: { id: string } };

    const asOrgA = (id: string) => ({ params: Promise.resolve({ id }) });
    const get = (method: "GET" | "PATCH" | "DELETE") =>
      company[method](
        new NextRequest("http://localhost/api/test", {
          method,
          ...(method === "PATCH" ? { body: JSON.stringify({ name: "Hijacked" }) } : {}),
        }),
        asOrgA(data.id)
      );

    expect((await get("GET")).status).toBe(200);

    signIn("ADMIN", "org-b");
    expect((await get("GET")).status).toBe(404);
    expect((await get("PATCH")).status).toBe(404);
    expect((await get("DELETE")).status).toBe(404);

    const listed = (await (await companies.GET(new NextRequest("http://localhost/api/companies"), { params: Promise.resolve({}) })).json()) as {
      data: { id: string }[];
    };
    expect(listed.data.map((c) => c.id)).not.toContain(data.id);
  });

  it("returns 400 for invalid settings from an admin", async () => {
    const settings = (await loaders["/src/app/api/settings/route.ts"]()) as { PUT: Handler };
    signIn("ADMIN");
    expect((await call(settings.PUT, "PUT", "/src/app/api/settings/route.ts", { legalName: 5 })).status).toBe(400);
  });
});
