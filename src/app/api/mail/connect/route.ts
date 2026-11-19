import { NextResponse } from "next/server";
import { requireRole } from "@/server/authz";
import { buildConsentUrl, createState } from "@/server/lib/mail/oauth";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

/** Starts the one-time Google consent for the company mailbox. Admin only. */
export async function GET() {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: "Google sign-in is not configured on the server" }, { status: 400 });
  }
  return NextResponse.redirect(buildConsentUrl(createState(guard.user.id)));
}
