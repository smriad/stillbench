import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

export async function readHealth(): Promise<Partial<Record<HealthKey, HealthRecord>>> {
  try {
    return JSON.parse(await readFile(healthPath, "utf8"));
  } catch {
    return {};
  }
}

export async function recordHealth(key: HealthKey, ok: boolean, note: string) {
  try {
    const health = await readHealth();
    health[key] = { ok, at: new Date().toISOString(), note };
    await mkdir(path.dirname(healthPath), { recursive: true });
    await writeFile(healthPath, JSON.stringify(health, null, 2));
  } catch (error) {
    console.error("Could not save the integration health record.", error);
  }
}
