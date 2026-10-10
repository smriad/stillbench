import type { OpenAICompatibleConfig } from "@mastra/core/llm";

export function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
}

export function ollamaModelId() {
  return process.env.OLLAMA_MODEL ?? "gemma3:4b";
}

/** Trim so Render “set but empty” env vars do not skip the local `ollama` fallback. */
export function ollamaApiKey() {
  const key = process.env.OLLAMA_API_KEY?.trim();
  return key || undefined;
}

export function ollamaRemote() {
  const host = new URL(ollamaBaseUrl()).hostname;
  return {
    host,
    remote: !["127.0.0.1", "localhost", "::1"].includes(host),
    droplet: host.endsWith(".sslip.io"),
  };
}

/** Remote OpenRouter / droplet hosts need a real bearer token. */
export function gemmaInferenceReady() {
  const { remote } = ollamaRemote();
  return remote ? Boolean(ollamaApiKey()) : true;
}

export function gemmaAgentModel(): OpenAICompatibleConfig {
  const { remote } = ollamaRemote();
  return {
    providerId: "stillbench",
    modelId: ollamaModelId(),
    url: ollamaBaseUrl(),
    apiKey: remote ? ollamaApiKey() : ollamaApiKey() ?? "ollama",
  };
}
