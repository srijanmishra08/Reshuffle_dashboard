// Runs once when a server instance starts; fail fast on missing production configuration.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv } = await import("@/server/env-check");
    assertProductionEnv();
  }
}
