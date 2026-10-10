import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { loadAttempts } from "../../lib/attempts";
import { explainBenchChoice } from "../../lib/bench-pick";
import { allBenches, chooseBench, chooseNearest, eligibleBenches } from "../../lib/benches";
import { dhakaClock, lightMinutesLeft } from "../../lib/daylight";
import { forecastLeave } from "../../lib/forecast";
import { sanitizeDedication } from "../../lib/meaning";
import {
  companionLine,
  parseNeed,
  sitPlan,
} from "../../lib/need";
import {
  latestWalk,
  recentDebriefs,
  saveWalk,
  updateWalk,
  type Walk,
} from "../../lib/store";
import { startWalkWorkflow } from "../../lib/temporal";
import { temporalEnabled } from "../../lib/temporal-config";
import { synthesizeBrief } from "../../lib/voice";
import { closeStaleWalks } from "../../lib/walks";
import { recallForBrief } from "../../lib/backboard";
import { weatherHint } from "../../lib/weather";
import { writeBrief } from "../../lib/write-brief";

const PRACTICE_SIT_SECONDS = 20;
const sitNeedSchema = z.enum(["outside", "doorstep", "together"]);

const benchSchema = z.object({
  id: z.string(),
  name: z.string(),
  area: z.string(),
  minutesAway: z.number(),
  shade: z.enum(["water", "trees", "open"]),
  note: z.string(),
  source: z.enum(["curated", "serpapi"]).optional(),
});

const skySchema = z.object({
  practice: z.boolean(),
  need: sitNeedSchema,
  dedication: z.string().optional(),
  now: z.string(),
  hour: z.number(),
  lightMinutes: z.number(),
  lastBailed: z.boolean(),
});

const scoredSchema = skySchema.extend({
  source: z.enum(["baseline", "tabpfn"]),
  trainingRows: z.number(),
  candidates: z.array(z.object({ bench: benchSchema, probability: z.number() })),
});

const chosenSchema = skySchema.extend({
  source: z.enum(["baseline", "tabpfn"]),
  trainingRows: z.number(),
  bench: benchSchema,
  probability: z.number(),
  benchReason: z.string(),
});

const briefedSchema = chosenSchema.extend({
  brief: z.string(),
  model: z.string(),
  weatherSummary: z.string().optional(),
  companionLine: z.string().optional(),
});

const departedSchema = z.object({
  walkId: z.string(),
  spoken: z.boolean(),
  durable: z.boolean(),
});

const readSky = createStep({
  id: "read-sky",
  description: "Read the clock, the light left, and whether the last walk was a bail.",
  inputSchema: z.object({
    practice: z.boolean(),
    need: sitNeedSchema.default("outside"),
    dedication: z.string().optional(),
  }),
  outputSchema: skySchema,
  execute: async ({ inputData }) => {
    const now = new Date();
    await closeStaleWalks(now);
    const previous = await latestWalk();
    const need = parseNeed(inputData.need);
    return {
      practice: inputData.practice,
      need,
      dedication: sanitizeDedication(inputData.dedication),
      now: now.toISOString(),
      hour: dhakaClock(now).hour,
      lightMinutes: lightMinutesLeft(now),
      lastBailed: previous?.status === "bailed",
    };
  },
});

const forecastBenches = createStep({
  id: "forecast-benches",
  description: "Ask TabPFN how likely you are to walk to each bench that fits the light.",
  inputSchema: skySchema,
  outputSchema: scoredSchema,
  execute: async ({ inputData }) => {
    const plan = sitPlan(inputData.need);
    const pool = eligibleBenches(
      { ...inputData, closeOnly: plan.closeOnly },
      await allBenches(),
    );
    const rows = await loadAttempts();
    const forecast = await forecastLeave(
      rows,
      pool.map((bench) => ({
        hour: inputData.hour,
        minutesAway: bench.minutesAway,
        lightMinutes: inputData.lightMinutes,
        lastBailed: inputData.lastBailed,
      })),
    );
    return {
      ...inputData,
      source: forecast.source,
      trainingRows: forecast.neighbors,
      candidates: pool.map((bench, index) => ({
        bench,
        probability: forecast.probabilities[index],
      })),
    };
  },
});

const pickBench = createStep({
  id: "pick-bench",
  description: "Take the farthest bench you will probably still walk to.",
  inputSchema: scoredSchema,
  outputSchema: chosenSchema,
  execute: async ({ inputData }) => {
    const { candidates, ...rest } = inputData;
    const plan = sitPlan(inputData.need);
    const chosen = plan.nearest ? chooseNearest(candidates) : chooseBench(candidates);
    const benchReason = explainBenchChoice({
      need: inputData.need,
      lightMinutes: inputData.lightMinutes,
      lastBailed: inputData.lastBailed,
      minutesAway: chosen.bench.minutesAway,
      probability: chosen.probability,
      nearest: plan.nearest,
    });
    return {
      ...rest,
      bench: chosen.bench,
      probability: chosen.probability,
      benchReason,
    };
  },
});

const writeTheBrief = createStep({
  id: "write-brief",
  description:
    "Gemma (or, half the time, the Tinker-tuned model) writes a fifteen-second brief from the bench, the light, and your past notes.",
  inputSchema: chosenSchema,
  outputSchema: briefedSchema,
  execute: async ({ inputData }) => {
    const past = await recentDebriefs(3);
    const known = await allBenches();
    const notes = past.map((walk) => ({
      area: known.find((bench) => bench.id === walk.benchId)?.area ?? "a bench",
      debrief: walk.debrief ?? "",
    }));
    const memory = await Promise.race([
      recallForBrief(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    if (memory) notes.unshift({ area: "a past sit", debrief: memory });
    const weather = await weatherHint();
    const weatherSummary = weather
      ? `${weather.tempC}°C, ${weather.summary}`
      : undefined;
    const brief = await writeBrief(
      {
        bench: inputData.bench,
        lightMinutes: inputData.lightMinutes,
        leaveProbability: inputData.probability,
        weather: weatherSummary,
        need: inputData.need,
        dedication: inputData.dedication,
      },
      notes,
      { tuned: Boolean(process.env.TINKER_BRIEF_MODEL) && Math.random() < 0.5 },
    );
    return {
      ...inputData,
      brief: brief.text,
      model: brief.model,
      weatherSummary,
      companionLine: companionLine(inputData.need, inputData.bench),
    };
  },
});

const saveAndSpeak = createStep({
  id: "save-and-speak",
  description: "Save the walk, voice the brief with ElevenLabs, and hand the timer to Temporal.",
  inputSchema: briefedSchema,
  outputSchema: departedSchema,
  execute: async ({ inputData }) => {
    const sitSeconds = inputData.practice
      ? PRACTICE_SIT_SECONDS
      : sitPlan(inputData.need).sitSeconds;
    const walk: Walk = {
      id: crypto.randomUUID(),
      benchId: inputData.bench.id,
      createdAt: inputData.now,
      status: "briefed",
      brief: inputData.brief,
      model: inputData.model,
      leaveProbability: inputData.probability,
      predictionSource: inputData.source,
      practice: inputData.practice,
      sitSeconds,
      hour: inputData.hour,
      minutesAway: inputData.bench.minutesAway,
      lightMinutes: inputData.lightMinutes,
      lastBailed: inputData.lastBailed,
      need: inputData.need,
      companionLine: inputData.companionLine,
      dedication: inputData.dedication,
      benchReason: inputData.benchReason,
      durable: temporalEnabled(),
      weatherSummary: inputData.weatherSummary,
    };

    await saveWalk(walk);
    const [spoken, durable] = await Promise.all([
      synthesizeBrief(walk.id, walk.brief),
      startWalkWorkflow({
        walkId: walk.id,
        sitSeconds,
        minutesAway: walk.minutesAway,
      }),
    ]);
    if (walk.durable && !durable) await updateWalk(walk.id, { durable: false });
    return { walkId: walk.id, spoken, durable };
  },
});

export const departWorkflow = createWorkflow({
  id: "depart",
  description: "From 'take me outside' to a spoken brief and a running sit timer.",
  inputSchema: z.object({
    practice: z.boolean(),
    need: sitNeedSchema.default("outside"),
    dedication: z.string().optional(),
  }),
  outputSchema: departedSchema,
})
  .then(readSky)
  .then(forecastBenches)
  .then(pickBench)
  .then(writeTheBrief)
  .then(saveAndSpeak)
  .commit();
