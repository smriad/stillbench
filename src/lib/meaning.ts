import type { SitNeed } from "./need";

export const DEDICATION_MAX = 80;

export function sanitizeDedication(value: unknown) {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  return clean.slice(0, DEDICATION_MAX);
}

export function noticePrompt(need: SitNeed = "outside") {
  if (need === "together") return "What did you both notice that wasn't a screen?";
  if (need === "doorstep") return "What was here, even if it was only the roof?";
  return "What was here that isn't a screen?";
}
