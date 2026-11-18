import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies ./drizzle migrations using DIRECT_URL (session mode or direct), falling back to DATABASE_URL.
 *
 * `--on-deploy` is what the Vercel build runs (`npm run vercel-build`): it migrates only for production deploys,
 * so branch previews never touch the real database, and it requires DIRECT_URL because the transaction pooler
 * in DATABASE_URL is not meant for schema changes. A failure exits non-zero, which fails the build and leaves
 * the previous deployment live.
 */
async function main() {
  const onDeploy = process.argv.includes("--on-deploy");
  if (onDeploy && process.env.VERCEL_ENV !== "production") {
    console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; they run on production deploys only).`);
    return;
  }

  const url = onDeploy ? process.env.DIRECT_URL : (process.env.DIRECT_URL ?? process.env.DATABASE_URL);
  if (!url) {
    throw new Error(onDeploy ? "DIRECT_URL is required to migrate on a production deploy" : "DIRECT_URL (or DATABASE_URL) is required");
  }

  const client = postgres(url, { max: 1, ssl: "require" });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
