import type { Walk } from "./store";

const DHAKA = "Asia/Dhaka";

export function dhakaDayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function previousDhakaDay(day: string) {
  const noon = new Date(`${day}T12:00:00+06:00`);
  noon.setDate(noon.getDate() - 1);
  return dhakaDayKey(noon.toISOString());
}

export function sitStreak(walks: Walk[]) {
  const days = new Set(
    walks
      .filter((walk) => !walk.practice && walk.status === "sat" && walk.endedAt)
      .map((walk) => dhakaDayKey(walk.endedAt!)),
  );
  let streak = 0;
  let day = dhakaDayKey(new Date().toISOString());
  while (days.has(day)) {
    streak += 1;
    day = previousDhakaDay(day);
  }
  return streak;
}

export function realSits(walks: Walk[]) {
  return walks.filter((walk) => !walk.practice && walk.status === "sat").length;
}

export function lastWalkBailed(walks: Walk[]) {
  const last = [...walks].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0];
  return last?.status === "bailed";
}

export function sitMinutesThisWeek(walks: Walk[], now = new Date()) {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return Math.round(
    walks
      .filter(
        (walk) =>
          !walk.practice &&
          walk.status === "sat" &&
          Date.parse(walk.endedAt ?? walk.createdAt) >= cutoff,
      )
      .reduce((sum, walk) => sum + walk.sitSeconds, 0) / 60,
  );
}

export type PublicEcho = {
  area: string;
  line: string;
  day: string;
};

export function lastSitMemory(
  walks: Walk[],
  benchArea: (benchId: string) => string,
  now = new Date(),
) {
  const last = [...walks]
    .filter((walk) => !walk.practice && walk.status === "sat")
    .sort(
      (a, b) =>
        Date.parse(b.endedAt ?? b.createdAt) - Date.parse(a.endedAt ?? a.createdAt),
    )[0];
  if (!last) return undefined;
  const area = benchArea(last.benchId);
  const day = dhakaDayKey(last.endedAt ?? last.createdAt);
  const today = dhakaDayKey(now.toISOString());
  const when = day === today ? "today" : day === previousDhakaDay(today) ? "yesterday" : `on ${day}`;
  if (last.dedication) return `You sat at ${area} ${when}, for ${last.dedication}.`;
  return `You sat at ${area} ${when}.`;
}

export function publicEchoes(
  walks: Walk[],
  benchArea: (benchId: string) => string,
  limit = 5,
): PublicEcho[] {
  return walks
    .filter((walk) => walk.shareDebrief && walk.debrief && walk.status === "sat")
    .sort((a, b) => Date.parse(b.endedAt ?? b.createdAt) - Date.parse(a.endedAt ?? a.createdAt))
    .slice(0, limit)
    .map((walk) => ({
      area: benchArea(walk.benchId),
      line: walk.debrief!.trim(),
      day: dhakaDayKey(walk.endedAt ?? walk.createdAt),
    }));
}
