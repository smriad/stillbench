import type { Agent } from "@mastra/core/agent";
import { mastra } from "../mastra";
import {
  BRIEF_INSTRUCTIONS,
  briefPrompt,
  cleanBrief,
  composeBrief,
  type BriefFacts,
  type PastNote,
} from "./compose-brief";
import { recordHealth } from "./health";
import { gemmaInferenceReady, ollamaModelId } from "./ollama-env";
import { TINKER_OAI, tinkerChatBody, tinkerErrorNote, tinkerReplyText } from "./tinker-oai";
import { traced } from "./trace";

const TIMEOUT_MS = 25_000;

function withTimeout<T>(work: Promise<T>, label: string) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
    }),
  ]);
}

type DraftBrief = { raw: string; model: string };

async function gemmaBrief(prompt: string): Promise<DraftBrief> {
  if (!gemmaInferenceReady()) {
    throw new Error("Gemma host is remote but OLLAMA_API_KEY is not set.");
  }
  const agent: Agent = mastra.getAgentById("stillbench");
  const response = await withTimeout(agent.generate(prompt, { maxSteps: 1 }), "Gemma");
  return { raw: await response.text, model: ollamaModelId() };
}

async function tunedBrief(prompt: string, checkpoint: string): Promise<DraftBrief> {
  const response = await traced("tinker.chat_completion", {}, () =>
    withTimeout(
      fetch(`${TINKER_OAI}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TINKER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          tinkerChatBody(checkpoint, [
            { role: "system", content: BRIEF_INSTRUCTIONS },
            { role: "user", content: prompt },
          ]),
        ),
      }),
      "Tinker",
    ),
  );
  if (!response.ok) {
    await recordHealth("tinker", false, tinkerErrorNote(response.status, await response.text()));
    throw new Error(`Tinker said ${response.status}.`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const raw = tinkerReplyText(payload);
  if (!raw) {
    await recordHealth("tinker", false, "Tinker returned an empty brief");
    throw new Error("Tinker returned an empty brief.");
  }
  await recordHealth("tinker", true, "wrote a brief");
  return {
    raw,
    model: process.env.TINKER_BRIEF_LABEL ?? "qwen3.5-4b-tuned",
  };
}

export async function pingTinker() {
  const checkpoint = process.env.TINKER_BRIEF_MODEL;
  if (!checkpoint || !process.env.TINKER_API_KEY) return false;
  try {
    const response = await withTimeout(
      fetch(`${TINKER_OAI}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TINKER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          tinkerChatBody(
            checkpoint,
            [{ role: "user", content: "Say the word roof." }],
            { maxTokens: 16, temperature: 0 },
          ),
        ),
      }),
      "Tinker",
    );
    if (!response.ok) {
      await recordHealth("tinker", false, tinkerErrorNote(response.status, await response.text()));
      return false;
    }
    const raw = tinkerReplyText(
      (await response.json()) as { choices?: { message?: { content?: string | null } }[] },
    );
    if (!raw) {
      await recordHealth("tinker", false, "Tinker returned an empty brief");
      return false;
    }
    await recordHealth("tinker", true, "checkpoint answered");
    return true;
  } catch (error) {
    await recordHealth(
      "tinker",
      false,
      error instanceof Error ? error.message.slice(0, 180) : "Tinker did not answer",
    );
    return false;
  }
}

export async function writeBrief(
  facts: BriefFacts,
  notes: PastNote[] = [],
  options: { tuned?: boolean } = {},
): Promise<{ text: string; model: string }> {
  const fallback = composeBrief(facts);
  const prompt = briefPrompt(facts, notes);
  const checkpoint = process.env.TINKER_BRIEF_MODEL;

  try {
    const { raw, model } =
      options.tuned && checkpoint && process.env.TINKER_API_KEY
        ? await tunedBrief(prompt, checkpoint)
        : await gemmaBrief(prompt);
    const text = cleanBrief(raw);
    if (text.split(/\s+/).length < 8 || /\btool\b/i.test(text)) {
      return { text: fallback, model: "composer" };
    }
    return {
      text: /pocket/i.test(text) ? text : `${text} Pocket the phone when you sit.`,
      model,
    };
  } catch (error) {
    console.error("Stillbench brief fell back to the composer.", error);
    return { text: fallback, model: "composer" };
  }
}
