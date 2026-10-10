export const TINKER_OAI = "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1";

/** Qwen 3.5-4B on Tinker 400s if this is an OpenAI string like "none". It only accepts booleans. */
export function tinkerChatBody(
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options: { maxTokens?: number; temperature?: number } = {},
) {
  return {
    model,
    messages,
    max_tokens: options.maxTokens ?? 120,
    temperature: options.temperature ?? 0.7,
    reasoning_effort: false,
    separate_reasoning: true,
  };
}

export function tinkerReplyText(payload: {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
}) {
  const message = payload.choices?.[0]?.message ?? {};
  return (message.content ?? "").trim();
}

export function tinkerErrorNote(status: number, body: string) {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim().slice(0, 180);
    }
  } catch {
    /* use the status line */
  }
  const clipped = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return clipped || `Tinker answered ${status}`;
}
