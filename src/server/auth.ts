import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db/client";
import type { Role } from "@/server/roles";
import { resolveRoleForEmail as resolveRole } from "@/server/session-user";

/** Decide whether an email may sign up, and with which role. Returns null if not allowed. */
export function resolveRoleForEmail(email: string): Promise<Role | null> {
  return resolveRole(getDb(), email);
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
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
      session: {
        create: {
          before: async (session) => {
            const rows = await getDb()
              .select({ email: schema.user.email, active: schema.user.active })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            const record = rows[0];

            if (!record || record.active === false || !(await resolveRoleForEmail(record.email))) {
              throw new APIError("FORBIDDEN", { message: "This email is no longer on the allowlist." });
            }
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
