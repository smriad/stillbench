import type { Bench } from "./benches";

export const SIT_NEEDS = ["outside", "doorstep", "together"] as const;
export type SitNeed = (typeof SIT_NEEDS)[number];

export type SitNeedPlan = {
  id: SitNeed;
  sitSeconds: number;
  closeOnly: boolean;
  nearest: boolean;
  companion: boolean;
};

const PLANS: Record<SitNeed, SitNeedPlan> = {
  outside: {
    id: "outside",
    sitSeconds: 12 * 60,
    closeOnly: false,
    nearest: false,
    companion: false,
  },
  doorstep: {
    id: "doorstep",
    sitSeconds: 6 * 60,
    closeOnly: true,
    nearest: true,
    companion: false,
  },
  together: {
    id: "together",
    sitSeconds: 12 * 60,
    closeOnly: false,
    nearest: false,
    companion: true,
  },
};

export function parseNeed(value: unknown): SitNeed {
  return SIT_NEEDS.includes(value as SitNeed) ? (value as SitNeed) : "outside";
}

export function sitPlan(need: SitNeed): SitNeedPlan {
  return PLANS[need];
}

export function companionLine(need: SitNeed, bench: Bench) {
  if (need !== "together") return undefined;
  return `If you came with someone: sit at ${bench.name} together. Phones in pockets. You do not have to talk.`;
}

export function checkInText(
  bench: Pick<Bench, "name" | "area" | "minutesAway">,
  sitSeconds: number,
  from = new Date(),
  travelMinutes = 0,
  dedication?: string,
) {
  const until = new Date(from.getTime() + (travelMinutes * 60 + sitSeconds) * 1000);
  const time = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const where =
    bench.minutesAway <= 2
      ? `${bench.name} (${bench.area})`
      : `${bench.name} in ${bench.area}, about ${bench.minutesAway} minutes away`;
  const forWhom = dedication ? ` This sit is for ${dedication}.` : "";
  return `I'm going to sit at ${where} until about ${time}.${forWhom} I'll be back after that.`;
}

export function afterSitLine(input: {
  need: SitNeed;
  practice: boolean;
  lastBailed: boolean;
  streak: number;
  minutesThisWeek: number;
  dedication?: string;
  area?: string;
}) {
  if (input.practice) return "Practice counted. The real sit is the same, just longer.";
  if (input.dedication) {
    const where = input.area ? ` at ${input.area}` : "";
    return `You sat${where} for ${input.dedication}.`;
  }
  if (input.need === "doorstep") return "That was enough. You do not owe the park a longer sit.";
  if (input.need === "together") return "Two people, one bench, phones away. That helps.";
  if (input.lastBailed) return "You sat after staying in. That is the whole product.";
  if (input.streak >= 2) return `${input.streak} days in a row you sat outside.`;
  if (input.minutesThisWeek >= 12) {
    return `${input.minutesThisWeek} minutes of air this week.`;
  }
  return "Twelve minutes, outside.";
}
