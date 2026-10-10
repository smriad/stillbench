import type { SitNeed } from "./need";

export type SitStoryInput = {
  benchName: string;
  benchArea: string;
  minutesAway: number;
  sitMinutes: number;
  need?: SitNeed;
  dedication?: string;
  debrief?: string;
  benchReason?: string;
  model?: string;
  predictionSource?: string;
  practice?: boolean;
};

/** Markdown snippet for a DEV post or journal—no coordinates. */
export function formatSitStory(input: SitStoryInput) {
  const sit =
    input.practice
      ? "practice sit"
      : input.need === "doorstep"
        ? "six-minute doorstep sit"
        : "twelve-minute sit";
  const lines = [
    "## Stillbench sit",
    "",
    `- **Where:** ${input.benchName} (${input.benchArea}), about ${input.minutesAway} minutes away`,
    `- **Sit:** ${sit} (${input.sitMinutes} minutes on the timer)`,
  ];
  if (input.dedication) lines.push(`- **For:** ${input.dedication}`);
  if (input.benchReason) lines.push(`- **Why this bench:** ${input.benchReason}`);
  if (input.model && input.predictionSource) {
    lines.push(
      `- **Open stack:** brief from \`${input.model}\`, bench scored with ${input.predictionSource}`,
    );
  }
  lines.push("- **Location:** not tracked—check-in uses a time, not GPS");
  if (input.debrief?.trim()) {
    lines.push("", `**Noticed:** ${input.debrief.trim()}`);
  }
  lines.push("", "_Built with Stillbench — open Gemma brief, TabPFN bench pick, phone in pocket._");
  return lines.join("\n");
}
