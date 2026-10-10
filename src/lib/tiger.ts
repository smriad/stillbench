import { Client } from "pg";
import { recordHealth } from "./health";
import type { Walk } from "./store";

let schemaReady = false;

export function tigerEnabled() {
  return Boolean(process.env.TIGER_DATABASE_URL);
}

function tigerConnectionString() {
  const raw = process.env.TIGER_DATABASE_URL;
  if (!raw) return null;
  return raw.includes("sslmode=")
    ? raw.replace("sslmode=require", "sslmode=no-verify")
    : `${raw}${raw.includes("?") ? "&" : "?"}sslmode=no-verify`;
}

async function withClient<T>(run: (client: Client) => Promise<T>) {
  const url = tigerConnectionString();
  if (!url) throw new Error("TIGER_DATABASE_URL is not set");
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function ensureSchemaOn(client: Client) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS sit_events (
      id TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL,
      outcome TEXT NOT NULL,
      bench_id TEXT,
      practice BOOLEAN NOT NULL DEFAULT FALSE,
      minutes_away INT,
      outside_confirmed BOOLEAN,
      debrief_len INT
    );
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS sit_events_at_idx ON sit_events (at DESC);`,
  );
  schemaReady = true;
}

async function ensureSchema() {
  if (schemaReady) return;
  await withClient((client) => ensureSchemaOn(client));
}

export async function recordSitEvent(walk: Walk) {
  if (!tigerEnabled() || (walk.status !== "sat" && walk.status !== "bailed")) return;
  try {
    await ensureSchema();
    await withClient((client) =>
      client.query(
        `INSERT INTO sit_events (
          id, at, outcome, bench_id, practice, minutes_away, outside_confirmed, debrief_len
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          at = EXCLUDED.at,
          outcome = EXCLUDED.outcome,
          outside_confirmed = EXCLUDED.outside_confirmed,
          debrief_len = EXCLUDED.debrief_len`,
        [
          walk.id,
          walk.endedAt ?? walk.createdAt,
          walk.status,
          walk.benchId,
          walk.practice,
          walk.minutesAway,
          walk.outsideConfirmed ?? false,
          walk.debrief?.length ?? 0,
        ],
      ),
    );
    await recordHealth("tiger", true, "sit event logged");
  } catch (error) {
    const note = error instanceof Error ? error.message : "insert failed";
    await recordHealth("tiger", false, note);
  }
}

export async function tigerSitCount() {
  if (!tigerEnabled()) return 0;
  await ensureSchema();
  const result = await withClient((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM sit_events WHERE practice = FALSE`),
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function pingTiger() {
  if (!tigerEnabled()) return false;
  await withClient((client) => client.query("SELECT 1"));
  return true;
}

/** One round trip for /integrations (schema + count). */
export async function tigerIntegrationCheck() {
  if (!tigerEnabled()) return 0;
  return withClient(async (client) => {
    await ensureSchemaOn(client);
    const result = await client.query(
      `SELECT COUNT(*)::int AS n FROM sit_events WHERE practice = FALSE`,
    );
    return Number(result.rows[0]?.n ?? 0);
  });
}
