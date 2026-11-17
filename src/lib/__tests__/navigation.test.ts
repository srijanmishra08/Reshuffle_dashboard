import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { departments, findDepartment, locate, overviewItem } from "../navigation";

const allItems = departments.flatMap((d) => d.items.map((item) => ({ ...item, department: d.key })));

describe("navigation", () => {
  it("lists every page once and every department with a unique key", () => {
    expect(new Set(allItems.map((i) => i.href)).size).toBe(allItems.length);
    expect(new Set(departments.map((d) => d.key)).size).toBe(departments.length);
    expect(departments.every((d) => d.items.length > 0)).toBe(true);
  });

  it("points every page at a route that exists", () => {
    const app = path.join(process.cwd(), "src/app");
    for (const item of allItems) {
      expect(existsSync(path.join(app, item.href, "page.tsx")), item.href).toBe(true);
    }
  });

  it("leaves no top-level page out of a department", () => {
    const app = path.join(process.cwd(), "src/app");
    // Pages that are deliberately not in the menu: sign-in, the public client pages, API routes and the department landing.
    const outOfMenu = new Set(["api", "d", "login", "p"]);
    const listed = new Set(allItems.map((i) => i.href.split("/")[1]));
    const missing = readdirSync(app, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !outOfMenu.has(e.name) && existsSync(path.join(app, e.name, "page.tsx")))
      .map((e) => e.name)
      .filter((name) => !listed.has(name));
    expect(missing).toEqual([]);
  });

  it("finds a department by key", () => {
    expect(findDepartment("finance")?.title).toBe("Finance");
    expect(findDepartment("nope")).toBeUndefined();
  });

  it("places a page in its department, including pages under it", () => {
    expect(locate("/crm").department?.key).toBe("crm");
    expect(locate("/crm/abc123").item?.href).toBe("/crm");
    expect(locate("/invoices/new").department?.key).toBe("finance");
    expect(locate("/projects/xyz").department?.key).toBe("delivery");
    expect(locate("/freelancers/xyz").department?.key).toBe("delivery");
    expect(locate("/events").department?.key).toBe("marketing");
    expect(locate("/letters/new").department?.key).toBe("admin");
  });

  it("uses the longest match, so the module library is Sales and Settings is People & Admin", () => {
    expect(locate("/settings/modules").department?.key).toBe("sales");
    expect(locate("/settings/modules").item?.title).toBe("Module library");
    expect(locate("/settings").department?.key).toBe("admin");
    expect(locate("/settings").item?.title).toBe("Settings");
  });

  it("knows the overview, department landing pages and unknown paths", () => {
    expect(locate("/").item).toBe(overviewItem);
    expect(locate("/").department).toBeNull();
    expect(locate("/d/finance")).toMatchObject({ department: { key: "finance" }, item: null });
    expect(locate("/d/unknown").department).toBeNull();
    expect(locate("/something-else")).toEqual({ department: null, item: null });
    // A path that merely starts with a page's name is not that page.
    expect(locate("/crmish").department).toBeNull();
  });
});
