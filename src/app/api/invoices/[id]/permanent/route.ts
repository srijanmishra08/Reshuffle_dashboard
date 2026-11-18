import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { ADMIN_ONLY } from "@/server/roles";
import { deleteInvoicePermanently } from "@/server/services/invoices";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Admin only: remove an invoice that should not exist, such as a test. */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await deleteInvoicePermanently(getDb(), toContext(guard.user), id));
}
