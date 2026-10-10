import { recordHealth } from "./health";

const BASE = "https://app.backboard.io/api";

export function backboardEnabled() {
  return Boolean(process.env.BACKBOARD_API_KEY && process.env.BACKBOARD_ASSISTANT_ID);
}

async function postMessage(
  content: string,
  options: { memory?: "Auto" | "Off"; system_prompt?: string } = {},
) {
  const response = await fetch(`${BASE}/threads/messages`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.BACKBOARD_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistant_id: process.env.BACKBOARD_ASSISTANT_ID,
      content,
      memory: options.memory ?? "Auto",
      system_prompt: options.system_prompt,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Backboard answered ${response.status}`);
  const payload = (await response.json()) as { content?: string };
  return (payload.content ?? "").trim();
}

export async function rememberDebrief(benchArea: string, debrief: string) {
  if (!backboardEnabled() || !debrief.trim()) return;
  try {
    await postMessage(
      `Outdoor sit at ${benchArea}. They noticed: ${debrief.trim().slice(0, 280)}`,
      {
        memory: "Auto",
        system_prompt:
          "Remember short sensory details from outdoor bench sits. Ignore cooking, recipes, and indoor tasks.",
      },
    );
    await recordHealth("backboard", true, "remembered a debrief");
  } catch (error) {
    const note = error instanceof Error ? error.message : "request failed";
    await recordHealth("backboard", false, note);
  }
}

/** One line Backboard may suggest for the next spoken brief. */
export async function recallForBrief(): Promise<string | null> {
  if (!backboardEnabled()) return null;
  try {
    const reply = await postMessage(
      "What one sensory detail from past outdoor sits should a brief mention? Reply with at most eight words, or NONE.",
      {
        memory: "Auto",
        system_prompt:
          "You help write outdoor sit briefs. Reply with at most eight words, or the word NONE.",
      },
    );
    const line = reply.replace(/^["']|["']$/g, "").trim();
    if (!line || /^none\.?$/i.test(line)) return null;
    await recordHealth("backboard", true, "offered a memory for the brief");
    return line.slice(0, 80);
  } catch (error) {
    const note = error instanceof Error ? error.message : "request failed";
    await recordHealth("backboard", false, note);
    return null;
  }
}

export async function pingBackboard() {
  if (!backboardEnabled()) return false;
  const response = await fetch(
    `${BASE}/assistants/${process.env.BACKBOARD_ASSISTANT_ID}`,
    {
      headers: { "X-API-Key": process.env.BACKBOARD_API_KEY! },
      cache: "no-store",
    },
  );
  return response.ok;
}
