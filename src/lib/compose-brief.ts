import type { Bench } from "./benches";
import type { SitNeed } from "./need";

export type BriefFacts = {
  bench: Bench;
  lightMinutes: number;
  leaveProbability: number;
  weather?: string;
  need?: SitNeed;
  dedication?: string;
};

export type PastNote = { area: string; debrief: string };

export const BRIEF_INSTRUCTIONS = `
You write a spoken departure brief for Stillbench.
The user message has the bench, the walk, the light, a tone to use,
sometimes a kind of sit, and sometimes what they noticed on earlier sits.
Use only those facts. Reply with only the words they will hear. No introduction.
Speak to them directly as "you".
Two or three short sentences, under 40 words.
Name the bench and how many minutes away it is.
Never mention the tone, the kind of sit by name, or how likely they are to go.
If this is a small sit, keep the walk tiny and do not make them feel they failed.
If they may sit with someone, say once that both phones go in pockets.
If they named who or what the sit is for, say it once, plainly. Do not moralize.
Do not diagnose, treat, or mention health conditions.
End by telling them to pocket the phone when they sit.
No markdown and no list.
`.trim();

function sitKind(facts: BriefFacts): SitNeed {
  return facts.need === "doorstep" || facts.need === "together" ? facts.need : "outside";
}

export function briefPrompt(facts: BriefFacts, notes: PastNote[] = []) {
  const need = sitKind(facts);
  const tone =
    need === "doorstep" || facts.leaveProbability < 0.45
      ? "Make the walk sound small and easy. The street does not have to be involved."
      : "Keep it plain and calm.";
  const kind =
    need === "doorstep"
      ? "Kind of sit: six minutes at the closest bench. The roof or the stoop counts."
      : need === "together"
        ? "Kind of sit: they may sit with another person. Mention once that both phones go away. Do not turn it into a conversation prompt."
        : "Kind of sit: twelve minutes at the bench.";
  const forWhom = facts.dedication
    ? `This sit is for: "${facts.dedication.replace(/["\n\r]/g, " ").slice(0, 80)}". Say it once.`
    : "";
  const memory = notes
    .map((note) => `- at ${note.area}: "${note.debrief.replace(/["\n\r]/g, " ").slice(0, 140)}"`)
    .join("\n");

  return `
Bench: ${facts.bench.name} in ${facts.bench.area} (${facts.bench.note}).
Walk: ${facts.bench.minutesAway} minutes.
Light: ${
    facts.lightMinutes > 0
      ? `${facts.lightMinutes} minutes of light left`
      : "the sun is down, keep the bench close"
  }.
${facts.weather ? `Air outside: ${facts.weather}. Mention it only if it fits in one short phrase.` : ""}
${kind}
${forWhom}
Tone: ${tone}
${memory ? `What they noticed on recent sits:\n${memory}\nYou may echo one of these in a few words.` : ""}
Reply with only the sentences they will hear.
`.trim();
}

export function composeBrief(facts: BriefFacts) {
  const need = sitKind(facts);
  const light =
    facts.lightMinutes > 0
      ? `about ${facts.lightMinutes} minutes of light`
      : "no light left, so stay close";
  const air = facts.weather ? ` It feels like ${facts.weather}.` : "";
  const forWhom = facts.dedication ? ` This sit is for ${facts.dedication}.` : "";
  if (need === "doorstep") {
    return `Stay at ${facts.bench.name} in ${facts.bench.area}. It is ${facts.bench.minutesAway} minutes, or less. Six quiet minutes.${air}${forWhom} Pocket the phone when you sit.`;
  }
  if (need === "together") {
    return `Walk to ${facts.bench.name} in ${facts.bench.area}. It is ${facts.bench.minutesAway} minutes away, with ${light}.${air}${forWhom} If someone is with you, they can sit too. Pocket the phones when you sit.`;
  }
  return `Walk to ${facts.bench.name} in ${facts.bench.area}. It is ${facts.bench.minutesAway} minutes away, with ${light}.${air}${forWhom} Pocket the phone when you sit.`;
}

export function cleanBrief(text: string) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:okay[,.]?\s*)?(?:here(?:'s| is)\b[^:]{0,120}:\s*)/i, "")
    .replace(/^(?:okay[,.]?\s*)?here(?:'s| is)\b[^.]*\.\s*/i, "")
    .trim();

  const sentences = stripped
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);

  const joined = sentences.join(" ");
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length <= 40) return joined;
  return `${words.slice(0, 40).join(" ")}.`;
}
