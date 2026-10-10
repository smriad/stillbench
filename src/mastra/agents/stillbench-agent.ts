import { Agent } from "@mastra/core/agent";
import { BRIEF_INSTRUCTIONS } from "../../lib/compose-brief";
import { gemmaAgentModel } from "../../lib/ollama-env";

export const stillbenchAgent = new Agent({
  id: "stillbench",
  name: "Stillbench",
  instructions: BRIEF_INSTRUCTIONS,
  model: gemmaAgentModel(),
});
