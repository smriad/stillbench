import { mkdir, readFile, appendFile, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { mongo, mongoEnabled } from "./db";
import { dataDir, seedDir } from "./paths";
import type { AttemptRow } from "./predict";

const seedPath = path.join(seedDir, "attempts.seed.csv");
const livePath = path.join(dataDir, "attempts.csv");

function parseBool(value: string) {
  return value === "1" || value.toLowerCase() === "true";
}

export function parseAttempts(csv: string): AttemptRow[] {
  const lines = csv
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("hour"));

  return lines.map((line) => {
    const [hour, minutesAway, lightMinutes, lastBailed, left] = line.split(",");
    return {
      hour: Number(hour),
      minutesAway: Number(minutesAway),
      lightMinutes: Number(lightMinutes),
      lastBailed: parseBool(lastBailed ?? "0"),
      left: parseBool(left ?? "0"),
    };
  });
}

async function attemptsCollection() {
  const collection = (await mongo()).collection<AttemptRow & { at: Date }>("attempts");
  if ((await collection.estimatedDocumentCount()) === 0) {
    const seed = parseAttempts(await readFile(seedPath, "utf8"));
    await collection.insertMany(seed.map((row) => ({ ...row, at: new Date(0) })));
  }
  return collection;
}

async function ensureLiveFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await access(livePath);
  } catch {
    await copyFile(seedPath, livePath);
  }
}

export async function loadAttempts(): Promise<AttemptRow[]> {
  if (mongoEnabled()) {
    return (await attemptsCollection())
      .find({}, { sort: { at: 1 }, projection: { _id: 0, at: 0 } })
      .toArray();
  }
  await ensureLiveFile();
  return parseAttempts(await readFile(livePath, "utf8"));
}

export async function recordAttempt(row: AttemptRow) {
  if (mongoEnabled()) {
    await (await attemptsCollection()).insertOne({ ...row, at: new Date() });
    return;
  }
  await ensureLiveFile();
  const line = [
    row.hour,
    row.minutesAway,
    row.lightMinutes,
    row.lastBailed ? 1 : 0,
    row.left ? 1 : 0,
  ].join(",");
  await appendFile(livePath, `${line}\n`);
}
