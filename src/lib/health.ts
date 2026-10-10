import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mongo, mongoEnabled } from "./db";
import { dataFile } from "./paths";

export type HealthKey =
  | "tabpfn"
  | "tts"
  | "chime"
  | "stt"
  | "tinker"
  | "backboard"
  | "tiger";
export type HealthRecord = { ok: boolean; at: string; note: string };

const healthPath = dataFile("health.json");
const META_KIND = "integration_health";

type HealthDoc = Partial<Record<HealthKey, HealthRecord>>;

async function readHealthFromMongo(): Promise<HealthDoc | null> {
  if (!mongoEnabled()) return null;
  try {
    const db = await mongo();
    const doc = await db
      .collection<{ kind: string; records?: HealthDoc }>("meta")
      .findOne({ kind: META_KIND });
    if (!doc) return null;
    return doc.records ?? {};
  } catch (error) {
    console.error("Could not read integration health from MongoDB.", error);
    return null;
  }
}

async function writeHealthToMongo(records: HealthDoc) {
  if (!mongoEnabled()) return;
  try {
    const db = await mongo();
    await db.collection("meta").updateOne(
      { kind: META_KIND },
      { $set: { kind: META_KIND, records, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
  } catch (error) {
    console.error("Could not save integration health to MongoDB.", error);
  }
}

export async function readHealth(): Promise<HealthDoc> {
  const fromMongo = await readHealthFromMongo();
  if (fromMongo !== null) return fromMongo;
  try {
    return JSON.parse(await readFile(healthPath, "utf8")) as HealthDoc;
  } catch {
    return {};
  }
}

export async function recordHealth(key: HealthKey, ok: boolean, note: string) {
  const record: HealthRecord = { ok, at: new Date().toISOString(), note };
  const health = await readHealth();
  health[key] = record;
  await writeHealthToMongo(health);
  try {
    await mkdir(path.dirname(healthPath), { recursive: true });
    await writeFile(healthPath, JSON.stringify(health, null, 2));
  } catch (error) {
    console.error("Could not save the integration health record.", error);
  }
}
