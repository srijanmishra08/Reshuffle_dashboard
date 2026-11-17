"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/helpers";
import { departments, locate, overviewItem } from "@/lib/navigation";

/** Desktop sidebar: Overview, then one collapsible group per department. The current department opens by itself. */
export function SidebarNav() {
  const pathname = usePathname();
  const here = locate(pathname);
  // Departments the person opened or closed by hand. Anything not listed follows the current page.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => manual[key] ?? here.department?.key === key;
  const OverviewIcon = overviewItem.icon;

  return (
    <nav aria-label="Departments" className="mt-5 space-y-1">
      <Link
        href={overviewItem.href}
        aria-current={pathname === "/" ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          pathname === "/" ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"
        )}
      >
        <OverviewIcon className="h-4 w-4" />
        {overviewItem.title}
      </Link>

      {departments.map((department) => {
        const Icon = department.icon;
        const open = isOpen(department.key);
        const current = here.department?.key === department.key;
        const landing = pathname === `/d/${department.key}`;
        return (
          <div key={department.key} className="pt-1">
            <div className={cn("flex items-center rounded-xl", landing ? "bg-slate-900 text-white" : current ? "bg-slate-100" : "hover:bg-slate-100")}>
              <Link
                href={`/d/${department.key}`}
                aria-current={landing ? "page" : undefined}
                className={cn("flex flex-1 items-center gap-3 px-3 py-2.5 text-sm font-semibold", landing ? "text-white" : "text-slate-900")}
              >
                <Icon className={cn("h-4 w-4", landing ? "text-white" : "text-slate-500")} />
                {department.title}
              </Link>
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${department.title}`}
                onClick={() => setManual({ ...manual, [department.key]: !open })}
                className={cn("mr-1 rounded-lg p-1.5", landing ? "text-white hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200")}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
            {open ? (
              <ul className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                {department.items.map((item) => {
                  const active = here.item?.href === item.href;
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.description}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition",
                          active ? "bg-slate-900 font-medium text-white" : "text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        <ItemIcon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-slate-400")} />
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Phone bar: departments on the first row, and the current department's pages on the second. */
export function MobileNav() {
  const pathname = usePathname();
  const here = locate(pathname);
  const chip = "shrink-0 rounded-full border px-3 py-1 text-xs font-medium";
  return (
    <div className="fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur md:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/" className={cn(chip, pathname === "/" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700")}>
          Overview
        </Link>
        {departments.map((d) => (
          <Link
            key={d.key}
            href={`/d/${d.key}`}
            className={cn(chip, here.department?.key === d.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700")}
          >
            {d.title}
          </Link>
        ))}
      </div>
      {here.department ? (
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1">
          {here.department.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(chip, here.item?.href === item.href ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600")}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
