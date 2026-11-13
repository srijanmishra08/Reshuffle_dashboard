import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/public-paths";
import { safeNextPath } from "@/lib/safe-next";
import { assertProductionEnv, missingProductionEnv } from "@/server/env-check";

describe("isPublicPath", () => {
  it("allows public prefixes and their children", () => {
    for (const p of ["/login", "/api/auth/callback/google", "/api/health", "/api/cron/daily", "/p/abc"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("does not match look-alike or private paths", () => {
    for (const p of ["/login-admin", "/api/authx", "/api/healthz", "/api/cronjobs", "/pricing", "/crm", "/"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/crm?x=1")).toBe("/crm?x=1");
  });

  it("rejects external, protocol-relative, backslash and control-char values", () => {
    for (const v of ["https://evil.test", "//evil.test", "/\\evil.test", "/a\\b", "/\t/evil.test", "evil", "", null, undefined]) {
      expect(safeNextPath(v)).toBe("/");
    }
  });
});

describe("assertProductionEnv", () => {
  const full = {
    NODE_ENV: "production",
    DATABASE_URL: "x",
    BETTER_AUTH_SECRET: "x",
    BETTER_AUTH_URL: "x",
    GOOGLE_CLIENT_ID: "x",
    GOOGLE_CLIENT_SECRET: "x",
  };

  it("passes when everything is set", () => {
    expect(() => assertProductionEnv(full)).not.toThrow();
  });

  it("names missing or blank variables without values", () => {
    expect(missingProductionEnv({ ...full, GOOGLE_CLIENT_ID: " ", BETTER_AUTH_SECRET: undefined })).toEqual([
      "BETTER_AUTH_SECRET",
      "GOOGLE_CLIENT_ID",
    ]);
    expect(() => assertProductionEnv({ ...full, BETTER_AUTH_SECRET: "" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("is a no-op outside production and during the build", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).not.toThrow();
  });
});
