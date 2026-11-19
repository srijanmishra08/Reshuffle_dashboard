import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { exchangeCode, verifyState } from "@/server/lib/mail/oauth";
import { toContext } from "@/server/lib/route";
import { saveConnection } from "@/server/services/mail-connection";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

function back(request: NextRequest, result: "connected" | "error", message?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("mail", result);
  if (message) url.searchParams.set("mailMessage", message.slice(0, 200));
  return NextResponse.redirect(url);
}

/** Google sends the admin back here with a one-time code. */
export async function GET(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(request, "error", "Google did not grant access");
  const code = params.get("code");
  if (!code || !verifyState(params.get("state"), guard.user.id)) return back(request, "error", "The sign-in link expired. Try again.");

  try {
    const mailbox = await exchangeCode(code);
    await saveConnection(getDb(), toContext(guard.user), mailbox);
    return back(request, "connected");
  } catch (error) {
    return back(request, "error", error instanceof Error ? error.message : "Could not connect Gmail");
  }
}
