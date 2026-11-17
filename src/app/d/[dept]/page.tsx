import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { DepartmentFigures } from "@/components/department-figures";
import { findDepartment } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default async function DepartmentPage({ params }: { params: Promise<{ dept: string }> }) {
  const { dept } = await params;
  const department = findDepartment(dept);
  if (!department) notFound();

  return (
    <DashboardShell title={department.title} subtitle={department.description}>
      <div className="space-y-6">
        <DepartmentFigures departmentKey={department.key} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {department.items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
              >
                <Icon className="h-5 w-5 text-slate-500 group-hover:text-slate-900" />
                <p className="mt-3 font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
