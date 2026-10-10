import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const key = process.env.BACKBOARD_API_KEY;
if (!key) throw new Error("Set BACKBOARD_API_KEY first.");

const body = {
  name: "Stillbench memory",
  system_prompt:
    "You remember short sensory details from outdoor bench sits: smell, air, light, birds, weather. When asked for one detail for a spoken walking brief, reply in at most eight words, or the word NONE. Never mention cooking, recipes, or indoor tasks.",
};

async function main() {
const response = await fetch("https://app.backboard.io/api/assistants", {
  method: "POST",
  headers: { "X-API-Key": key!, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await response.text();
if (!response.ok) {
  throw new Error(`Backboard create assistant: ${response.status} ${text.slice(0, 300)}`);
}
const data = JSON.parse(text) as { assistant_id?: string; id?: string; name?: string };
const id = data.assistant_id ?? data.id;
if (!id) throw new Error(`No assistant id in response: ${text.slice(0, 200)}`);

const envPath = path.join(process.cwd(), ".env.local");
let env = readFileSync(envPath, "utf8");
const line = `BACKBOARD_ASSISTANT_ID=${id}`;
env = env.includes("BACKBOARD_ASSISTANT_ID=")
  ? env.replace(/^BACKBOARD_ASSISTANT_ID=.*/m, line)
  : `${env.trimEnd()}\n${line}\n`;
writeFileSync(envPath, env, { mode: 0o600 });

const name = data.name ?? "Stillbench memory";
console.log(`Created "${name}" and wrote BACKBOARD_ASSISTANT_ID to .env.local.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
