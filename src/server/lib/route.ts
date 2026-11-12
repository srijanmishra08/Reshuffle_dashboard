import type { AuthedUser } from "@/server/authz";
import type { ServiceContext } from "@/server/services/companies";

export function toContext(user: AuthedUser): ServiceContext {
  return { orgId: user.orgId, userId: user.id };
}

/** Parse a JSON body; returns undefined on malformed JSON so validation reports it. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
