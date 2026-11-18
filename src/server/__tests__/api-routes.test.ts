/// <reference types="vite/client" />
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";

const state = vi.hoisted(() => ({
  db: null as unknown,
  session: null as null | { user: Record<string, unknown> },
  cookies: {} as Record<string, string>,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (name in state.cookies ? { name, value: state.cookies[name] } : undefined),
    set: (name: string, value: string) => {
      state.cookies[name] = value;
    },
    delete: (name: string) => {
      delete state.cookies[name];
    },
  }),
}));
vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: async () => state.session } }),
}));
vi.mock("@/server/session-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/session-user")>();
  // The allowlist lookup has its own tests (session-user.test.ts); here the session is trusted as given.
  return {
    ...original,
    resolveSessionUser: async (
      _db: unknown,
      raw: { id: string; email: string; name: string; role?: string; orgId?: string; active?: boolean; links?: Record<string, string | null> }
    ) =>
      raw.active === false
        ? null
        : {
            id: raw.id,
            email: raw.email,
            name: raw.name,
            role: raw.role,
            orgId: raw.orgId ?? "default",
            links: raw.links ?? { companyId: null, freelancerId: null, agencyId: null },
          },
  };
});
vi.mock("@/server/lib/storage", () => {
  const files = new Map<string, Buffer>();
  return {
    supabaseStorage: {
      put: async (bucket: string, path: string, body: Buffer) => void files.set(`${bucket}/${path}`, body),
      get: async (bucket: string, path: string) => files.get(`${bucket}/${path}`) ?? null,
      remove: async (bucket: string, path: string) => void files.delete(`${bucket}/${path}`),
    },
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
  // Called by the invoice software with a key; tested on its own below.
  "/src/app/api/ingest/",
];
const ADMIN_ONLY_FILES = [
  "/src/app/api/settings/route.ts",
  "/src/app/api/access/route.ts",
  "/src/app/api/agencies/route.ts",
  "/src/app/api/agencies/[id]/route.ts",
  "/src/app/api/agencies/[id]/members/route.ts",
  "/src/app/api/preview/route.ts",
  "/src/app/api/demo/route.ts",
  "/src/app/api/ingest-keys/route.ts",
  "/src/app/api/ingest-keys/[id]/route.ts",
  "/src/app/api/uploaded-documents/[id]/route.ts",
];
// Outside people (clients, partner agencies, freelancers) never reach team routes.
const OUTSIDERS = ["FREELANCER", "CLIENT", "AGENCY"];
// Portal routes belong to one outside role each, named by the folder under /api/portal/.
const PORTAL_PREFIX = "/src/app/api/portal/";
const PORTAL_ROLE: Record<string, string> = { client: "CLIENT", freelancer: "FREELANCER", agency: "AGENCY" };

function signIn(role: string, orgId = "default", links?: Record<string, string | null>) {
  state.session = { user: { id: `${role}-${orgId}`, email: "x@example.test", name: "X", role, orgId, active: true, links } };
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
  state.cookies = {};
});

const guardedRoutes = Object.keys(loaders).filter((file) => !PUBLIC.some((p) => file.startsWith(p)) && !file.startsWith(PORTAL_PREFIX));
const portalRoutes = Object.keys(loaders).filter((file) => file.startsWith(PORTAL_PREFIX));

describe("route guards", () => {
  it("discovers the API routes", () => {
    expect(guardedRoutes.length).toBeGreaterThan(15);
  });

  for (const file of guardedRoutes) {
    describe(file.replace("/src/app/api", ""), () => {
      for (const method of METHODS) {
        it(`${method}: 401 signed out, 403 for outside roles${ADMIN_ONLY_FILES.includes(file) ? " and non-admins" : ""}`, async () => {
          const mod = await loaders[file]();
          const handler = mod[method] as Handler | undefined;
          if (!handler) return;

          state.session = null;
          expect((await call(handler, method, file, {})).status).toBe(401);

          const blocked = ADMIN_ONLY_FILES.includes(file) ? [...OUTSIDERS, "MEMBER", "MANAGER"] : OUTSIDERS;
          for (const role of blocked) {
            signIn(role);
            expect((await call(handler, method, file, {})).status, `${role} on ${method}`).toBe(403);
          }
        });
      }
    });
  }

  it("discovers the portal routes", () => {
    expect(portalRoutes.length).toBeGreaterThanOrEqual(5);
    for (const file of portalRoutes) expect(PORTAL_ROLE[file.slice(PORTAL_PREFIX.length).split("/")[0]], file).toBeDefined();
  });

  for (const file of portalRoutes) {
    const owner = PORTAL_ROLE[file.slice(PORTAL_PREFIX.length).split("/")[0]];
    describe(file.replace("/src/app/api", ""), () => {
      for (const method of METHODS) {
        it(`${method}: 401 signed out, 403 for every role but ${owner}`, async () => {
          const mod = await loaders[file]();
          const handler = mod[method] as Handler | undefined;
          if (!handler) return;

          state.session = null;
          expect((await call(handler, method, file, {})).status).toBe(401);

          for (const role of ["ADMIN", "MANAGER", "MEMBER", "CLIENT", "AGENCY", "FREELANCER"].filter((r) => r !== owner)) {
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

describe("portal routes check ownership", () => {
  it("lets a client act only on their own company's records", async () => {
    const { createCompany } = await import("@/server/services/companies");
    const { createProject, createTask } = await import("@/server/services/project-tasks");
    const staff = { orgId: "default", userId: "staff" };
    const own = (await createCompany(db, staff, { name: "Route Test Own" }));
    const other = (await createCompany(db, staff, { name: "Route Test Other" }));
    if (!own.ok || !other.ok) throw new Error("setup failed");
    const mine = await createProject(db, staff, { companyId: own.data.id, name: "Mine" });
    const theirs = await createProject(db, staff, { companyId: other.data.id, name: "Theirs" });
    if (!mine.ok || !theirs.ok) throw new Error("setup failed");
    const myTask = await createTask(db, staff, mine.data.id, { title: "Mine", status: "CLIENT_REVIEW" });
    const theirTask = await createTask(db, staff, theirs.data.id, { title: "Theirs", status: "CLIENT_REVIEW" });
    if (!myTask.ok || !theirTask.ok) throw new Error("setup failed");

    const respondFile = "/src/app/api/portal/client/tasks/[id]/respond/route.ts";
    const { POST } = (await loaders[respondFile]()) as { POST: Handler };
    const send = (id: string) =>
      POST(new NextRequest("http://localhost/api/test", { method: "POST", body: JSON.stringify({ decision: "APPROVE" }), headers: { "content-type": "application/json" } }), {
        params: Promise.resolve({ id }),
      });

    signIn("CLIENT", "default", { companyId: own.data.id, freelancerId: null, agencyId: null });
    expect((await send(theirTask.data.id)).status).toBe(404);
    expect((await send(myTask.data.id)).status).toBe(200);
    expect((await send(myTask.data.id)).status).toBe(409);

    signIn("CLIENT", "default", { companyId: null, freelancerId: null, agencyId: null });
    expect((await send(theirTask.data.id)).status).toBe(404);

    const pdfFile = "/src/app/api/portal/client/invoices/[id]/pdf/route.ts";
    const { GET } = (await loaders[pdfFile]()) as { GET: Handler };
    signIn("CLIENT", "default", { companyId: own.data.id, freelancerId: null, agencyId: null });
    expect((await call(GET, "GET", pdfFile)).status).toBe(404);
  });
});

describe("portal preview", () => {
  const respondFile = "/src/app/api/portal/client/tasks/[id]/respond/route.ts";
  const previewFile = "/src/app/api/preview/route.ts";
  const companiesFile = "/src/app/api/companies/route.ts";

  async function startPreview(as: string) {
    const { POST } = (await loaders[previewFile]()) as { POST: Handler };
    return POST(new NextRequest("http://localhost/api/preview", { method: "POST", body: JSON.stringify({ as }), headers: { "content-type": "application/json" } }), {
      params: Promise.resolve({}),
    });
  }
  const clientRespond = async () => {
    const { POST } = (await loaders[respondFile]()) as { POST: Handler };
    return call(POST, "POST", respondFile, { decision: "APPROVE" });
  };

  it("lets a real admin act as an outside role, and still blocks the team routes while doing so", async () => {
    signIn("ADMIN");
    expect((await clientRespond()).status).toBe(403);
    expect((await startPreview("CLIENT")).status).toBe(200);
    expect(state.cookies.rs_preview).toBe("CLIENT");
    // Acting as the demo client: the client route is reachable (task unknown, so 404), team routes are not.
    expect((await clientRespond()).status).toBe(404);
    const { GET } = (await loaders[companiesFile]()) as { GET: Handler };
    expect((await call(GET, "GET", companiesFile)).status).toBe(403);

    const { DELETE } = (await loaders[previewFile]()) as { DELETE: Handler };
    expect((await call(DELETE, "DELETE", previewFile)).status).toBe(200);
    expect(state.cookies.rs_preview).toBeUndefined();
    expect((await call(GET, "GET", companiesFile)).status).toBe(200);
  });

  it("previews a real client read-only, and refuses a record that does not exist", async () => {
    const { createCompany } = await import("@/server/services/companies");
    const made = await createCompany(db, { orgId: "default", userId: "staff" }, { name: "Real Preview Co" });
    if (!made.ok) throw new Error("setup failed");
    const startWith = async (body: unknown) => {
      const { POST } = (await loaders[previewFile]()) as { POST: Handler };
      return POST(new NextRequest("http://localhost/api/preview", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({}) });
    };
    signIn("ADMIN");
    expect((await startWith({ as: "CLIENT", recordId: "no-such-company" })).status).toBe(404);
    expect(state.cookies.rs_preview).toBeUndefined();
    expect((await startWith({ as: "CLIENT", recordId: made.data.id })).status).toBe(200);
    expect(state.cookies.rs_preview).toBe(`CLIENT:${made.data.id}`);
    // Acting as that client, a change is refused (403) rather than being treated as a missing task (404).
    expect((await clientRespond()).status).toBe(403);
    signIn("MANAGER");
    expect((await clientRespond()).status).toBe(403);
  });

  it("refuses an unknown role and anyone who is not an admin", async () => {
    signIn("ADMIN");
    expect((await startPreview("MANAGER")).status).toBe(400);
    for (const role of ["MANAGER", "MEMBER", "CLIENT", "AGENCY", "FREELANCER"]) {
      signIn(role);
      expect((await startPreview("CLIENT")).status, role).toBe(403);
    }
  });

  it("ignores a forged preview cookie from a non-admin", async () => {
    state.cookies.rs_preview = "CLIENT";
    signIn("MANAGER");
    expect((await clientRespond()).status).toBe(403);
    signIn("MEMBER");
    expect((await clientRespond()).status).toBe(403);
    const { GET } = (await loaders[companiesFile]()) as { GET: Handler };
    expect((await call(GET, "GET", companiesFile)).status).toBe(200);
  });

  it("ignores a cookie with an unknown value", async () => {
    state.cookies.rs_preview = "ADMIN";
    signIn("ADMIN");
    const { GET } = (await loaders[companiesFile]()) as { GET: Handler };
    expect((await call(GET, "GET", companiesFile)).status).toBe(200);
  });
});

describe("invoice software upload", () => {
  const file = "/src/app/api/ingest/documents/route.ts";
  const origin = "https://invoice-eight-neon.vercel.app";
  const pdfBytes = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

  async function makeKey(label = "Test key") {
    const { createIngestKey } = await import("@/server/services/ingest");
    const made = await createIngestKey(db, { orgId: "default", userId: "admin" }, { label });
    if (!made.ok) throw new Error("setup failed");
    return made.data;
  }

  async function upload(opts: { token?: string | null; fromOrigin?: string | null; bytes?: Buffer | null; docType?: string; contentLength?: number; invoiceJson?: string } = {}) {
    const { POST } = (await loaders[file]()) as { POST: Handler };
    const form = new FormData();
    if (opts.bytes !== null) form.set("file", new File([new Uint8Array(opts.bytes ?? pdfBytes("route test"))], "x.pdf", { type: "application/pdf" }));
    form.set("docType", opts.docType ?? "INVOICE");
    form.set("number", "ROUTE/1");
    form.set("partyName", "Route Client");
    form.set("amountText", "₹500.00");
    form.set("dateText", "1 June 2026");
    if (opts.invoiceJson) form.set("invoiceJson", opts.invoiceJson);
    const headers: Record<string, string> = {};
    if (opts.token !== null) headers.authorization = `Bearer ${opts.token}`;
    if (opts.fromOrigin !== null) headers.origin = opts.fromOrigin ?? origin;
    if (opts.contentLength) headers["content-length"] = String(opts.contentLength);
    return POST(new NextRequest("http://localhost/api/ingest/documents", { method: "POST", body: form, headers }), { params: Promise.resolve({}) });
  }

  it("answers the browser's preflight for the invoice software only", async () => {
    const { OPTIONS } = (await loaders[file]()) as { OPTIONS: Handler };
    const ask = (from: string) => OPTIONS(new NextRequest("http://localhost/api/ingest/documents", { method: "OPTIONS", headers: { origin: from } }), { params: Promise.resolve({}) });
    const ok = await ask(origin);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(origin);
    expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");
    const denied = await ask("https://evil.example");
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("saves a PDF sent with a valid key, once, and lets the browser read the answer", async () => {
    const { token } = await makeKey();
    const first = await upload({ token });
    expect(first.status).toBe(201);
    expect(first.headers.get("access-control-allow-origin")).toBe(origin);
    expect(((await first.json()) as { data: { duplicate: boolean } }).data.duplicate).toBe(false);
    const again = await upload({ token });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: { duplicate: boolean } }).data.duplicate).toBe(true);
    const { listUploadedDocuments } = await import("@/server/services/ingest");
    const listed = await listUploadedDocuments(db, { orgId: "default", userId: "x" }, { q: "ROUTE/1" });
    expect(listed.ok && listed.data).toHaveLength(1);
    expect(listed.ok && listed.data[0]).toMatchObject({ amountPaise: 50_000, documentDate: "2026-06-01", partyName: "Route Client" });
  });

  it("refuses a missing, wrong or revoked key, with the answer still readable by the invoice software", async () => {
    const none = await upload({ token: null });
    expect(none.status).toBe(401);
    expect(none.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await upload({ token: "rsk_" + "a".repeat(43) })).status).toBe(401);
    expect((await upload({ token: "garbage" })).status).toBe(401);
    const { token, id } = await makeKey("To revoke");
    expect((await upload({ token, bytes: pdfBytes("before revoke") })).status).toBe(201);
    const { revokeIngestKey } = await import("@/server/services/ingest");
    await revokeIngestKey(db, { orgId: "default", userId: "admin" }, id);
    expect((await upload({ token, bytes: pdfBytes("after revoke") })).status).toBe(401);
  });

  it("refuses files that are not acceptable PDFs", async () => {
    const { token } = await makeKey("Validation");
    expect((await upload({ token, bytes: Buffer.from("not a pdf") })).status).toBe(400);
    expect((await upload({ token, bytes: null })).status).toBe(400);
    expect((await upload({ token, docType: "SALARY_SLIP", bytes: pdfBytes("slip") })).status).toBe(400);
    expect((await upload({ token, contentLength: 50 * 1024 * 1024 })).status).toBe(413);
  });

  it("tells the invoice software when an invoice could not be recorded, and why", async () => {
    const { token } = await makeKey("Details");
    const json = JSON.stringify({ clientName: "Some Client Ltd", items: [{ description: "Work", amount: "not a number" }] });
    const res = await upload({ token, bytes: pdfBytes("with details"), invoiceJson: json });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { data: { recorded: boolean; recordIssue: string } }).data).toMatchObject({ recorded: false, recordIssue: "BAD_ITEMS" });
  });

  it("gives no CORS permission to other websites", async () => {
    const { token } = await makeKey("Other origin");
    const res = await upload({ token, fromOrigin: "https://evil.example", bytes: pdfBytes("other origin") });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is not available to the team API under the same key", async () => {
    const { token } = await makeKey("Not a login");
    const { GET } = (await loaders["/src/app/api/uploaded-documents/route.ts"]()) as { GET: Handler };
    const res = await GET(new NextRequest("http://localhost/api/uploaded-documents", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });
});
