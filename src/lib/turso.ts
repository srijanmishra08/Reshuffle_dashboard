import { createClient, type Client } from "@libsql/client";

declare global {
  var tursoClient: Client | undefined;
  var tursoInitPromise: Promise<void> | undefined;
}

function getRequiredEnv(name: "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getTursoClient(): Client {
  if (global.tursoClient) {
    return global.tursoClient;
  }

  const url = getRequiredEnv("TURSO_DATABASE_URL");
  const authToken = getRequiredEnv("TURSO_AUTH_TOKEN");

  const client = createClient({
    url,
    authToken,
  });

  if (process.env.NODE_ENV !== "production") {
    global.tursoClient = client;
  }

  return client;
}

export async function ensureTursoSchema(): Promise<void> {
  if (global.tursoInitPromise) {
    return global.tursoInitPromise;
  }

  const run = async () => {
    const client = getTursoClient();

    await client.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT,
        notes TEXT,
        stage TEXT NOT NULL DEFAULT 'LEAD',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'TODO',
        deadline TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        assigned_to TEXT,
        title TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'TODO',
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        due_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger TEXT NOT NULL,
        condition_json TEXT,
        action_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS pipeline_items (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        stage TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS social_entries (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        script TEXT NOT NULL DEFAULT '',
        platform TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_social_entries_date ON social_entries (date)"
    );
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_items_module_entity ON pipeline_items (module, entity_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_pipeline_items_module_stage ON pipeline_items (module, stage)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_projects_client ON projects (client_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id)"
    );
    await client.execute(
      "CREATE INDEX IF NOT EXISTS idx_activity_module_created ON activity_logs (module, created_at DESC)"
    );
  };

  global.tursoInitPromise = run();

  try {
    await global.tursoInitPromise;
  } finally {
    if (process.env.NODE_ENV === "production") {
      global.tursoInitPromise = undefined;
    }
  }
}
