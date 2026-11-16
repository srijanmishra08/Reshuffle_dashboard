import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { deleteTask, updateTask } from "@/server/services/project-tasks";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updateTask(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await deleteTask(getDb(), toContext(guard.user), id));
}
