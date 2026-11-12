import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db/client";
import { isRole, type Role } from "@/server/roles";

function bootstrapAdminEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Decide whether an email may sign up, and with which role. Returns null if not allowed. */
export async function resolveRoleForEmail(email: string): Promise<Role | null> {
  const normalized = email.trim().toLowerCase();

  if (bootstrapAdminEmails().includes(normalized)) {
    return "ADMIN";
  }

  const rows = await getDb()
    .select({ role: schema.allowedEmails.role })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1);

  const role = rows[0]?.role;
  return role && isRole(role) ? role : null;
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "MEMBER", input: false },
        orgId: { type: "string", required: false, defaultValue: "default", input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const role = await resolveRoleForEmail(user.email);

            if (!role) {
              throw new APIError("FORBIDDEN", { message: "This email is not on the allowlist." });
            }

            return { data: { ...user, email: user.email.toLowerCase(), role } };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let cached: Auth | undefined;

export function getAuth(): Auth {
  if (!cached) {
    cached = createAuth();
  }
  return cached;
}
