import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { mongo, mongoEnabled } from "./db";
import type { SitNeed } from "./need";
import { dataDir } from "./paths";

export type WalkStatus = "briefed" | "left" | "sitting" | "sat" | "bailed";

export type Walk = {
  id: string;
  benchId: string;
  createdAt: string;
  status: WalkStatus;
  brief: string;
  model: string;
  leaveProbability: number;
  predictionSource: string;
  practice: boolean;
  sitSeconds: number;
  hour: number;
  minutesAway: number;
  lightMinutes: number;
  lastBailed: boolean;
  need?: SitNeed;
  companionLine?: string;
  dedication?: string;
  benchReason?: string;
  sittingStartedAt?: string;
  endedAt?: string;
  endedBy?: "you" | "timer";
  debrief?: string;
  durable?: boolean;
  outsideConfirmed?: boolean;
  shareDebrief?: boolean;
  nickname?: string;
  weatherSummary?: string;
};

const walksPath = path.join(dataDir, "walks.json");

async function walksCollection() {
  return (await mongo()).collection<Walk>("walks");
}

async function readWalks(): Promise<Walk[]> {
  try {
    return JSON.parse(await readFile(walksPath, "utf8")) as Walk[];
  } catch {
    return [];
  }
}

async function writeWalks(walks: Walk[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(walksPath, JSON.stringify(walks, null, 2));
}

export async function readAllWalks(): Promise<Walk[]> {
  if (mongoEnabled()) {
    return (await walksCollection())
      .find({}, { sort: { createdAt: 1 }, projection: { _id: 0 } })
      .toArray();
  }
  return readWalks();
}

export async function saveWalk(walk: Walk) {
  if (mongoEnabled()) {
    await (await walksCollection()).insertOne({ ...walk });
    return walk;
  }
  const walks = await readWalks();
  walks.push(walk);
  await writeWalks(walks);
  return walk;
}

export async function getWalk(id: string) {
  if (mongoEnabled()) {
    return (await walksCollection()).findOne({ id }, { projection: { _id: 0 } });
  }
  const walks = await readWalks();
  return walks.find((walk) => walk.id === id) ?? null;
}

export async function latestWalk() {
  if (mongoEnabled()) {
    return (await walksCollection()).findOne(
      {},
      { sort: { createdAt: -1 }, projection: { _id: 0 } },
    );
  }
  const walks = await readWalks();
  return walks.at(-1) ?? null;
}

export async function openWalks() {
  const open: WalkStatus[] = ["briefed", "left", "sitting"];
  if (mongoEnabled()) {
    return (await walksCollection())
      .find({ status: { $in: open } }, { projection: { _id: 0 } })
      .toArray();
  }
  return (await readWalks()).filter((walk) => open.includes(walk.status));
}

export async function recentDebriefs(limit = 3) {
  if (mongoEnabled()) {
    return (await walksCollection())
      .find(
        { debrief: { $exists: true, $ne: "" } },
        { sort: { createdAt: -1 }, limit, projection: { _id: 0 } },
      )
      .toArray();
  }
  return (await readWalks())
    .filter((walk) => walk.debrief)
    .slice(-limit)
    .reverse();
}

export async function updateWalk(id: string, patch: Partial<Walk>) {
  if (mongoEnabled()) {
    return (await walksCollection()).findOneAndUpdate(
      { id },
      { $set: patch },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  }
  const walks = await readWalks();
  const index = walks.findIndex((walk) => walk.id === id);
  if (index === -1) return null;
  walks[index] = { ...walks[index], ...patch };
  await writeWalks(walks);
  return walks[index];
}
