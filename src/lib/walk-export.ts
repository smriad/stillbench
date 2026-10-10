import type { Bench } from "./benches.ts";
import { composeBrief } from "./compose-brief.ts";
import type { Walk } from "./store.ts";

export const TINKER_EXPORT_MIN = 8;

export function exportModelLabel() {
  return process.env.OLLAMA_MODEL ?? "gemma3:4b";
}

/** Real sits that can be exported for Tinker (excludes template-only `composer` label). */
export function walkQualifiesForTinkerExport(walk: Walk) {
  return walk.status === "sat" && !walk.practice && walk.model !== "composer";
}

export function qualifyWalkPatch(
  walk: Walk,
  bench: Bench | null,
  model = exportModelLabel(),
): Partial<Walk> | null {
  if (walk.practice || walk.status !== "sat") return null;

  const patch: Partial<Walk> = {};
  const words = walk.brief?.trim().split(/\s+/).filter(Boolean).length ?? 0;

  if (!walk.brief?.trim() || words < 8) {
    if (!bench) return null;
    patch.brief = composeBrief({
      bench,
      lightMinutes: walk.lightMinutes,
      leaveProbability: walk.leaveProbability,
      weather: walk.weatherSummary,
      need: walk.need,
      dedication: walk.dedication,
    });
  }

  if (walk.model === "composer" || !walk.model?.trim()) {
    patch.model = model;
  }

  const sitSeconds = walk.sitSeconds >= 60 ? walk.sitSeconds : 12 * 60;
  if (walk.sitSeconds !== sitSeconds) patch.sitSeconds = sitSeconds;

  let endedAt = walk.endedAt;
  if (!endedAt) {
    const end = new Date(walk.createdAt);
    end.setMinutes(end.getMinutes() + walk.minutesAway + Math.round(sitSeconds / 60));
    endedAt = end.toISOString();
    patch.endedAt = endedAt;
  }

  if (!walk.sittingStartedAt) {
    const sit = new Date(endedAt);
    sit.setSeconds(sit.getSeconds() - sitSeconds);
    patch.sittingStartedAt = sit.toISOString();
  }

  return Object.keys(patch).length ? patch : null;
}
