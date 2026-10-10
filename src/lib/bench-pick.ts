import { STRETCH_CHANCE } from "./benches.ts";
import type { SitNeed } from "./need";

export type BenchPickFacts = {
  need: SitNeed;
  lightMinutes: number;
  lastBailed: boolean;
  minutesAway: number;
  probability: number;
  nearest: boolean;
};

/** Plain-language reason this bench was offered (no GPS, no shame). */
export function explainBenchChoice(facts: BenchPickFacts): string {
  if (facts.need === "doorstep") {
    return "You asked for a small sit. Stillbench picked the closest bench—the roof or stoop counts.";
  }
  if (facts.need === "together") {
    return "Room for two. This bench is far enough to be a walk, close enough to share.";
  }
  if (facts.lastBailed) {
    return "You stayed in last time, so every option today stays close.";
  }
  if (facts.lightMinutes < 25) {
    return "Not much light left, so the walk stays short.";
  }
  if (facts.nearest) {
    return "This is the nearest place to sit that still counts.";
  }
  if (facts.probability >= STRETCH_CHANCE) {
    return `From your past sits, you often still walk about ${facts.minutesAway} minutes at this hour.`;
  }
  if (facts.probability < 0.45) {
    return "Today looks hard to leave, so Stillbench kept the bench close.";
  }
  return "Stillbench picked the farthest bench you are likely to reach before it gets dark.";
}
