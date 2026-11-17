import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../client";

// postgres-js connects lazily, so creating a client here opens no connection.
describe("getDb", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:6543/db");
    global.dbInstance = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    global.dbInstance = undefined;
  });

  it("returns one shared client in production, not a new connection per call", () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = getDb();
    expect(getDb()).toBe(first);
    expect(getDb()).toBe(first);
  });

  it("returns one shared client in development too", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getDb()).toBe(getDb());
  });

  it("fails clearly when the database URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getDb()).toThrow(/DATABASE_URL/);
  });
});
