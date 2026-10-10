import { Agent } from "@mastra/core/agent";
import { BRIEF_INSTRUCTIONS } from "../../lib/compose-brief";

const ollamaUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1";
const ollamaModel = process.env.OLLAMA_MODEL ?? "gemma3:4b";

export const stillbenchAgent = new Agent({
  id: "stillbench",
  name: "Stillbench",
  instructions: BRIEF_INSTRUCTIONS,
  model: {
    id: `ollama/${ollamaModel}`,
    url: ollamaUrl,
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  },
});
