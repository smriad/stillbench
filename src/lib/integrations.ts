import { access } from "node:fs/promises";
import * as Sentry from "@sentry/node";
import { loadAttempts } from "./attempts";
import { allBenches } from "./benches";
import { mongo, mongoEnabled } from "./db";
import { readHealth, type HealthRecord } from "./health";
import { dataFile } from "./paths";
import { countExportableWalks, TINKER_EXPORT_MIN } from "./walk-qualify";
import { readAllWalks } from "./store";
import { tabpfnReady } from "./tabpfn";
import { gemmaInferenceReady, ollamaApiKey, ollamaBaseUrl, ollamaModelId, ollamaRemote } from "./ollama-env";
import { TASK_QUEUE, temporalConnectionOptions, temporalEnabled } from "./temporal-config";

export type IntegrationState = "on" | "set" | "off" | "error";

export type Integration = {
  name: string;
  role: string;
  state: IntegrationState;
  detail: string;
  fix?: string;
};

const CHECK_MS = 4_000;
const globalForDevice = globalThis as unknown as { stillbenchDeviceSeen?: number };

export function markDeviceSeen() {
  globalForDevice.stillbenchDeviceSeen = Date.now();
}

function within<T>(work: Promise<T>, ms = CHECK_MS) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`no answer in ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function ago(timestamp: number) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

async function gemma(): Promise<Integration> {
  const url = ollamaBaseUrl();
  const { host, remote, droplet } = ollamaRemote();
  const where = droplet ? "the droplet" : remote ? host : "this machine";
  const model = ollamaModelId();
  const base = { name: "Gemma", role: "Writes the spoken brief, on open weights" };
  if (remote && !gemmaInferenceReady()) {
    return {
      ...base,
      state: "off",
      detail: `${where} needs an API key, so briefs come from the built-in writer`,
      fix: "Set OLLAMA_API_KEY",
    };
  }
  try {
    const response = await within(
      fetch(`${url.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${ollamaApiKey() ?? "ollama"}` },
        cache: "no-store",
      }),
    );
    if (!response.ok) throw new Error(`Ollama answered ${response.status}`);
    const payload = (await response.json()) as { data?: { id: string }[] };
    const loaded = payload.data?.some((item) => item.id === model);
    return loaded
      ? { ...base, state: "on", detail: `${model} is served by ${where}` }
      : {
          ...base,
          state: "error",
          detail: `${where} is up but does not list ${model}`,
          fix: remote && !droplet ? "Check OLLAMA_MODEL against the provider's model id" : `ollama pull ${model}`,
        };
  } catch (error) {
    if (process.env.RENDER && !remote) {
      return {
        ...base,
        state: "error",
        detail: "Render cannot run Ollama, so briefs come from the built-in writer",
        fix: "Set OLLAMA_BASE_URL and OLLAMA_API_KEY to the DigitalOcean droplet",
      };
    }
    return {
      ...base,
      state: "error",
      detail: `${where} did not answer (${message(error)})`,
      fix: remote ? `Check ${droplet ? "the droplet" : host} and OLLAMA_API_KEY` : "Start Ollama",
    };
  }
}

async function tabpfn(): Promise<Integration> {
  const base = { name: "TabPFN", role: "Picks the farthest bench you will still walk to" };
  if (!process.env.PRIORLABS_API_KEY) {
    return { ...base, state: "off", detail: "Using the local baseline", fix: "Set PRIORLABS_API_KEY" };
  }
  const rows = await loadAttempts();
  if (!tabpfnReady(rows)) {
    return { ...base, state: "set", detail: `Key set, waiting for a sit and a bail (${rows.length} rows)` };
  }
  const last = (await readHealth()).tabpfn;
  if (!last) return { ...base, state: "set", detail: `Key set, ${rows.length} rows ready, not called yet` };
  return last.ok
    ? { ...base, state: "on", detail: `Last call ${ago(Date.parse(last.at))}: ${last.note}` }
    : {
        ...base,
        state: "error",
        detail: `Last call ${ago(Date.parse(last.at))} failed: ${last.note}`,
        fix: "Check PRIORLABS_API_KEY and the server log",
      };
}

async function elevenlabs(): Promise<Integration> {
  const base = { name: "ElevenLabs", role: "Voices the brief, rings the chime, hears the debrief" };
  if (!process.env.ELEVENLABS_API_KEY) {
    return { ...base, state: "off", detail: "The phone's own voice reads the brief", fix: "Set ELEVENLABS_API_KEY" };
  }
  const health = await readHealth();
  const chimeCached = await exists(dataFile("audio", "chime.mp3"));
  const pieces: [string, HealthRecord | undefined, string][] = [
    ["Voice", health.tts, "text_to_speech"],
    ["Chime", chimeCached ? { ok: true, at: "", note: "generated" } : health.chime, "sound_generation"],
    ["Debrief", health.stt, "speech_to_text"],
  ];
  const lines = pieces.map(([label, record]) =>
    !record ? `${label}: not used yet` : `${label}: ${record.ok ? "works" : `failed, ${record.note}`}`,
  );
  const failed = pieces.filter(([, record]) => record && !record.ok);
  const worked = pieces.some(([, record]) => record?.ok);
  return {
    ...base,
    state: failed.length && !worked ? "error" : worked ? "on" : "set",
    detail: lines.join(" · "),
    fix: failed.length
      ? `Give the key ${failed.map(([, , permission]) => permission).join(" and ")} permission`
      : undefined,
  };
}

async function temporal(): Promise<Integration> {
  const base = { name: "Temporal", role: "Keeps the sit timer when the phone sleeps" };
  if (!temporalEnabled()) {
    return { ...base, state: "off", detail: "The phone keeps time on its own", fix: "Set TEMPORAL_ADDRESS" };
  }
  if (process.env.RENDER && !mongoEnabled()) {
    return {
      ...base,
      state: "error",
      detail: "The worker and the web service have separate disks, so the worker cannot close walks",
      fix: "Set MONGODB_URI on both Render services",
    };
  }
  try {
    const { Connection } = await import("@temporalio/client");
    const connection = await within(Connection.connect(temporalConnectionOptions()));
    try {
      const queue = await within(
        connection.workflowService.describeTaskQueue({
          namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
          taskQueue: { name: TASK_QUEUE },
          taskQueueType: 1,
        }),
      );
      const workers = queue.pollers?.length ?? 0;
      return workers > 0
        ? { ...base, state: "on", detail: `Server up, ${workers} worker${workers === 1 ? "" : "s"} listening` }
        : {
            ...base,
            state: "error",
            detail: "Server up, but no worker is listening",
            fix: process.env.RENDER ? "Start the stillbench-walk-timer worker in render.yaml" : "npm run worker",
          };
    } finally {
      await connection.close();
    }
  } catch (error) {
    return {
      ...base,
      state: "error",
      detail: `Server did not answer (${message(error)})`,
      fix: "npm run temporal:dev",
    };
  }
}

async function mastraWorkflow(): Promise<Integration> {
  const base = { name: "Mastra", role: "Runs the departure as a five-step workflow" };
  try {
    const { mastra } = await import("../mastra");
    const workflow = mastra.getWorkflow("departWorkflow");
    const steps = Object.keys(workflow.steps ?? {}).length;
    return { ...base, state: "on", detail: `Workflow "depart" registered with ${steps} steps` };
  } catch (error) {
    return { ...base, state: "error", detail: message(error) };
  }
}

async function sentry(): Promise<Integration> {
  const base = { name: "Sentry", role: "Traces the agent, TabPFN, and ElevenLabs" };
  if (!process.env.SENTRY_DSN) {
    return { ...base, state: "off", detail: "No traces are sent", fix: "Set SENTRY_DSN" };
  }
  await import("../mastra");
  return Sentry.getClient()
    ? { ...base, state: "on", detail: "Exporter is running" }
    : { ...base, state: "error", detail: "DSN set but the client did not start", fix: "Check the DSN" };
}

async function mongodb(): Promise<Integration> {
  const base = { name: "MongoDB Atlas", role: "Keeps walks and attempts off local disk" };
  if (!mongoEnabled()) {
    if (process.env.RENDER && !process.env.STILLBENCH_DATA_DIR) {
      return {
        ...base,
        state: "error",
        detail: "Walks are on Render's disk, which is wiped on every deploy",
        fix: "Set MONGODB_URI, or attach a Render disk and set STILLBENCH_DATA_DIR",
      };
    }
    return { ...base, state: "off", detail: `Walks are saved in ${process.env.STILLBENCH_DATA_DIR ?? "data/"}`, fix: "Set MONGODB_URI" };
  }
  try {
    const db = await within(mongo());
    await within(db.command({ ping: 1 }));
    const walks = await db.collection("walks").estimatedDocumentCount();
    return { ...base, state: "on", detail: `Connected, ${walks} walks stored` };
  } catch (error) {
    return { ...base, state: "error", detail: `Could not reach Atlas (${message(error)})`, fix: "Check MONGODB_URI and the IP allow list" };
  }
}

async function serpapi(): Promise<Integration> {
  const base = { name: "SerpApi", role: "Finds real parks near home" };
  const found = (await allBenches()).filter((bench) => bench.source === "serpapi").length;
  if (found) return { ...base, state: "on", detail: `${found} parks found and in the bench pool` };
  if (process.env.SERPAPI_API_KEY) {
    return { ...base, state: "set", detail: "Key set, no search run yet", fix: "npm run benches:find" };
  }
  return { ...base, state: "off", detail: "Only the hand-picked benches", fix: "Set SERPAPI_API_KEY" };
}

async function tinker(): Promise<Integration> {
  const base = { name: "Tinker", role: "Serves a model tuned on briefs that got you to sit" };
  if (!process.env.TINKER_API_KEY) {
    return { ...base, state: "off", detail: "Every brief comes from Gemma", fix: "Set TINKER_API_KEY" };
  }
  if (!process.env.TINKER_BRIEF_MODEL) {
    const exportable = await countExportableWalks();
    const need = Math.max(0, TINKER_EXPORT_MIN - exportable);
    const detail =
      exportable >= TINKER_EXPORT_MIN
        ? `${exportable} exportable sits — run python tinker/train_briefs.py`
        : `${exportable}/${TINKER_EXPORT_MIN} exportable sits`;
    const fix =
      need > 0
        ? `npm run qualify:walks or npm run seed:walks (${need} more)`
        : "npx tsx scripts/export-briefs.ts then python tinker/train_briefs.py";
    return { ...base, state: "set", detail, fix };
  }
  const tuned = (await readAllWalks()).filter(
    (walk) => walk.model === (process.env.TINKER_BRIEF_LABEL ?? "qwen3.5-4b-tuned"),
  ).length;
  let last = (await readHealth()).tinker;
  if (!last?.ok) {
    const { pingTinker } = await import("./write-brief");
    await pingTinker();
    last = (await readHealth()).tinker;
  }
  if (last && !last.ok) {
    const modelHint = last.note.toLowerCase().includes("not a valid tinker path");
    return {
      ...base,
      state: "error",
      detail: `Last call failed: ${last.note}`,
      fix: modelHint ? "Check TINKER_BRIEF_MODEL is a tinker:// sampler path" : "Reload this page after the next brief",
    };
  }
  return last
    ? { ...base, state: "on", detail: `Tuned model in use, ${tuned} briefs so far` }
    : { ...base, state: "set", detail: "Tuned model set, not picked for a walk yet" };
}

async function backboard(): Promise<Integration> {
  const base = { name: "Backboard", role: "Remembers debriefs and nudges the next brief" };
  if (!process.env.BACKBOARD_API_KEY || !process.env.BACKBOARD_ASSISTANT_ID) {
    return { ...base, state: "off", detail: "Briefs use only Mongo debriefs", fix: "Set BACKBOARD_API_KEY and BACKBOARD_ASSISTANT_ID" };
  }
  try {
    const last = (await readHealth()).backboard;
    if (last?.ok) {
      return { ...base, state: "on", detail: last.note };
    }
    if (last && !last.ok) {
      return { ...base, state: "error", detail: last.note, fix: "Check BACKBOARD_API_KEY" };
    }
    const { pingBackboard } = await import("./backboard");
    const ok = await within(pingBackboard(), 12_000);
    if (!ok) {
      return { ...base, state: "error", detail: "Assistant did not answer", fix: "Check BACKBOARD_ASSISTANT_ID" };
    }
    return { ...base, state: "set", detail: "Connected, not used on a walk yet" };
  } catch (error) {
    return { ...base, state: "error", detail: message(error), fix: "Check BACKBOARD_API_KEY" };
  }
}

async function tiger(): Promise<Integration> {
  const base = { name: "Tiger Data", role: "Stores sit events in Timescale for analytics" };
  if (!process.env.TIGER_DATABASE_URL) {
    return { ...base, state: "off", detail: "Events stay in MongoDB only", fix: "Set TIGER_DATABASE_URL" };
  }
  try {
    const { tigerIntegrationCheck } = await import("./tiger");
    const count = await within(tigerIntegrationCheck(), 15_000);
    return { ...base, state: "on", detail: `Connected, ${count} real sit events logged` };
  } catch (error) {
    return { ...base, state: "error", detail: message(error), fix: "Check TIGER_DATABASE_URL and the IP allow list" };
  }
}

async function arduino(): Promise<Integration> {
  const base = { name: "Arduino", role: "The pocket pebble buzzes when the sit ends" };
  if (!process.env.STILLBENCH_DEVICE_TOKEN) {
    return { ...base, state: "off", detail: "No device token", fix: "Set STILLBENCH_DEVICE_TOKEN" };
  }
  const seen = globalForDevice.stillbenchDeviceSeen;
  if (seen && Date.now() - seen < 60_000) {
    return { ...base, state: "on", detail: `Pebble checked in ${ago(seen)}` };
  }
  return {
    ...base,
    state: "set",
    detail: seen ? `Pebble last checked in ${ago(seen)}` : "Token set, the pebble has not checked in",
    fix: "Power the pebble on",
  };
}

function hosting(gemmaRow: Integration): Integration[] {
  const render: Integration = process.env.RENDER
    ? { name: "Render", role: "Hosts the app", state: "on", detail: `Running on Render (${process.env.RENDER_SERVICE_NAME ?? "web"})` }
    : { name: "Render", role: "Hosts the app", state: "off", detail: "Running locally", fix: "Deploy with render.yaml" };
  const droplet = { name: "DigitalOcean", role: "Serves Gemma for the hosted demo" };
  const gemmaHost = ollamaRemote();
  const digitalocean: Integration = !gemmaHost.droplet
    ? {
        ...droplet,
        state: "off",
        detail: gemmaHost.remote
          ? `Not used, Gemma comes from ${gemmaHost.host}`
          : process.env.RENDER
            ? "No droplet yet, so the hosted app has no Gemma"
            : "Gemma runs on this machine",
        fix: gemmaHost.remote ? undefined : "deploy/digitalocean/cloud-init.yaml",
      }
    : gemmaRow.state === "on"
      ? { ...droplet, state: "on", detail: "Gemma is answering from the droplet" }
      : { ...droplet, state: "error", detail: "The droplet is not serving Gemma", fix: gemmaRow.fix };
  return [render, digitalocean];
}

export async function checkIntegrations(): Promise<Integration[]> {
  const checks = [
    gemma,
    tabpfn,
    elevenlabs,
    mastraWorkflow,
    temporal,
    sentry,
    mongodb,
    serpapi,
    tinker,
    backboard,
    tiger,
    arduino,
  ];
  const settled = await Promise.all(
    checks.map((check) =>
      check().catch(
        (error): Integration => ({ name: check.name, role: "", state: "error", detail: message(error) }),
      ),
    ),
  );
  return [...settled, ...hosting(settled[0])];
}
