import { realSits, sitStreak } from "./stats.ts";
import type { Walk } from "./store.ts";

export type BenchRank = {
  benchId: string;
  area: string;
  sits: number;
  bails: number;
};

export type PlayerRank = {
  nickname: string;
  streak: number;
  sits: number;
};

export function sanitizeNickname(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  const clean = trimmed.slice(0, 24).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  return clean || undefined;
}

export function benchLeaderboard(
  walks: Walk[],
  area: (benchId: string) => string,
): BenchRank[] {
  const map = new Map<string, { sits: number; bails: number }>();
  for (const walk of walks) {
    if (walk.practice) continue;
    if (walk.status !== "sat" && walk.status !== "bailed") continue;
    const row = map.get(walk.benchId) ?? { sits: 0, bails: 0 };
    if (walk.status === "sat") row.sits += 1;
    else row.bails += 1;
    map.set(walk.benchId, row);
  }
  return [...map.entries()]
    .map(([benchId, counts]) => ({
      benchId,
      area: area(benchId),
      sits: counts.sits,
      bails: counts.bails,
    }))
    .sort((a, b) => b.sits - a.sits || a.area.localeCompare(b.area));
}

export function playerLeaderboard(walks: Walk[]): PlayerRank[] {
  const byKey = new Map<string, { label: string; walks: Walk[] }>();
  for (const walk of walks) {
    const label = sanitizeNickname(walk.nickname ?? "");
    if (!label) continue;
    const key = label.toLowerCase();
    const bucket = byKey.get(key);
    if (bucket) bucket.walks.push(walk);
    else byKey.set(key, { label, walks: [walk] });
  }
  const rows: PlayerRank[] = [];
  for (const { label, walks: subset } of byKey.values()) {
    rows.push({
      nickname: label,
      streak: sitStreak(subset),
      sits: realSits(subset),
    });
  }
  return rows.sort(
    (a, b) =>
      b.streak - a.streak ||
      b.sits - a.sits ||
      a.nickname.localeCompare(b.nickname),
  );
}
