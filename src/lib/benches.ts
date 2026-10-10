import { readFile } from "node:fs/promises";
import path from "node:path";

export type Bench = {
  id: string;
  name: string;
  area: string;
  minutesAway: number;
  shade: "water" | "trees" | "open";
  note: string;
  source?: "curated" | "serpapi";
};

export type ScoredBench = {
  bench: Bench;
  probability: number;
};

export const SIT_MINUTES = 12;
export const STRETCH_CHANCE = 0.6;
const CLOSE_MINUTES = 8;

export const benches: Bench[] = [
  {
    id: "gulshan-lake",
    name: "the lake bench",
    area: "Gulshan Lake",
    minutesAway: 12,
    shade: "water",
    note: "faces the water, quieter on the east side",
  },
  {
    id: "ramna",
    name: "the banyan bench",
    area: "Ramna Park",
    minutesAway: 18,
    shade: "trees",
    note: "deep shade, busy on Friday mornings",
  },
  {
    id: "dhanmondi",
    name: "the lakeside step",
    area: "Dhanmondi Lake",
    minutesAway: 8,
    shade: "water",
    note: "close, and the path is lit",
  },
  {
    id: "rooftop",
    name: "the roof",
    area: "your building",
    minutesAway: 2,
    shade: "open",
    note: "if the street feels like too much",
  },
];

const discoveredPath = path.join(
  process.env.STILLBENCH_DATA_DIR ?? path.join(process.cwd(), "data"),
  "benches.json",
);

export async function allBenches(): Promise<Bench[]> {
  try {
    const found = JSON.parse(await readFile(discoveredPath, "utf8")) as Bench[];
    const known = new Set(benches.map((bench) => bench.id));
    return [...benches, ...found.filter((bench) => !known.has(bench.id))];
  } catch {
    return benches;
  }
}

export async function findBench(id: string) {
  return (await allBenches()).find((bench) => bench.id === id) ?? null;
}

export function eligibleBenches(
  input: { lightMinutes: number; lastBailed: boolean; closeOnly?: boolean },
  pool: Bench[] = benches,
) {
  const close = pool.filter((bench) => bench.minutesAway <= CLOSE_MINUTES);
  if (input.closeOnly || input.lightMinutes < 25 || input.lastBailed) return close;
  const fits = pool.filter(
    (bench) => bench.minutesAway * 2 + SIT_MINUTES <= input.lightMinutes,
  );
  return fits.length ? fits : close;
}

export function chooseBench(scored: ScoredBench[]): ScoredBench {
  if (!scored.length) throw new Error("No bench to choose from.");
  const byDistance = [...scored].sort(
    (a, b) => b.bench.minutesAway - a.bench.minutesAway,
  );
  const stretch = byDistance.find((item) => item.probability >= STRETCH_CHANCE);
  if (stretch) return stretch;
  return [...scored].sort(
    (a, b) =>
      b.probability - a.probability || a.bench.minutesAway - b.bench.minutesAway,
  )[0];
}

export function chooseNearest(scored: ScoredBench[]): ScoredBench {
  if (!scored.length) throw new Error("No bench to choose from.");
  return [...scored].sort(
    (a, b) =>
      a.bench.minutesAway - b.bench.minutesAway || b.probability - a.probability,
  )[0];
}
