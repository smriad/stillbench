import assert from "node:assert/strict";
import test from "node:test";
import { benches, chooseBench, chooseNearest, eligibleBenches } from "./benches.ts";
import { briefPrompt, cleanBrief, composeBrief } from "./compose-brief.ts";
import { explainBenchChoice } from "./bench-pick.ts";
import { homeHeadline, HOME_PURPOSE } from "./home-copy.ts";
import { gemmaInferenceReady, ollamaApiKey } from "./ollama-env.ts";
import { formatSitStory } from "./sit-story.ts";
import { noticePrompt, sanitizeDedication } from "./meaning.ts";
import { afterSitLine, checkInText, companionLine, parseNeed, sitPlan } from "./need.ts";
import { TINKER_OAI, tinkerChatBody, tinkerErrorNote, tinkerReplyText } from "./tinker-oai.ts";
import { predictLeave } from "./predict.ts";
import type { AttemptRow } from "./predict.ts";
import { attemptsToCsv, readLeaveProbabilities, tabpfnReady } from "./tabpfn.ts";
import { benchLeaderboard, playerLeaderboard, sanitizeNickname } from "./leaderboard.ts";
import { qualifyWalkPatch, walkQualifiesForTinkerExport } from "./walk-export.ts";
import { dhakaDayKey, lastSitMemory, lastWalkBailed, sitMinutesThisWeek, sitStreak } from "./stats.ts";
import type { Walk } from "./store.ts";

const bench = (id: string) => benches.find((item) => item.id === id)!;

const rows: AttemptRow[] = [
  { hour: 8, minutesAway: 12, lightMinutes: 500, lastBailed: false, left: true },
  { hour: 9, minutesAway: 12, lightMinutes: 480, lastBailed: false, left: true },
  { hour: 8, minutesAway: 14, lightMinutes: 520, lastBailed: false, left: true },
  { hour: 19, minutesAway: 18, lightMinutes: -10, lastBailed: false, left: false },
  { hour: 20, minutesAway: 18, lightMinutes: -40, lastBailed: false, left: false },
  { hour: 18, minutesAway: 16, lightMinutes: 0, lastBailed: false, left: false },
];

test("a recent bail or no light keeps every option close", () => {
  for (const input of [
    { lightMinutes: 400, lastBailed: true },
    { lightMinutes: 10, lastBailed: false },
  ]) {
    const pool = eligibleBenches(input);
    assert.ok(pool.length > 0);
    assert.ok(pool.every((item) => item.minutesAway <= 8));
  }
});

test("a bench is only offered if there and back plus the sit fits the light", () => {
  const ids = eligibleBenches({ lightMinutes: 40, lastBailed: false }).map((item) => item.id);
  assert.ok(ids.includes("gulshan-lake"));
  assert.ok(!ids.includes("ramna"));
});

test("the farthest bench you will probably still walk to wins", () => {
  const chosen = chooseBench([
    { bench: bench("rooftop"), probability: 0.9 },
    { bench: bench("dhanmondi"), probability: 0.8 },
    { bench: bench("gulshan-lake"), probability: 0.65 },
    { bench: bench("ramna"), probability: 0.3 },
  ]);
  assert.equal(chosen.bench.id, "gulshan-lake");
});

test("when nothing is likely, the likeliest bench wins", () => {
  const chosen = chooseBench([
    { bench: bench("rooftop"), probability: 0.4 },
    { bench: bench("ramna"), probability: 0.2 },
  ]);
  assert.equal(chosen.bench.id, "rooftop");
});

test("similar hours vote on whether you leave", () => {
  const morning = predictLeave(rows, {
    hour: 8,
    minutesAway: 12,
    lightMinutes: 500,
    lastBailed: false,
  });
  const night = predictLeave(rows, {
    hour: 19,
    minutesAway: 18,
    lightMinutes: -20,
    lastBailed: false,
  });
  assert.equal(morning.source, "baseline");
  assert.ok(morning.probability > 0.7);
  assert.ok(night.probability < 0.3);
});

test("a model preamble is not part of what gets spoken", () => {
  const brief = cleanBrief(
    "Okay, here's a fifteen-second departure brief based on your input: The roof is two minutes away. Pocket the phone when you sit.",
  );
  assert.equal(brief.startsWith("The roof"), true);
  assert.doesNotMatch(brief, /here'?s/i);
});

test("TabPFN needs both outcomes before it will fit", () => {
  const stayed = rows.map((row) => ({ ...row, left: false }));
  assert.equal(tabpfnReady(rows), true);
  assert.equal(tabpfnReady(stayed), false);
  assert.equal(tabpfnReady(rows.slice(0, 3)), false);
});

test("a TabPFN probability table becomes one chance per bench", () => {
  assert.deepEqual(readLeaveProbabilities([[0.2, 0.8]], 1), [0.8]);
  assert.deepEqual(
    readLeaveProbabilities(
      [
        [0.3, 0.7],
        [0.6, 0.4],
      ],
      2,
    ),
    [0.7, 0.4],
  );
  assert.deepEqual(readLeaveProbabilities({ "1": [0.66, 0.5] }, 2), [0.66, 0.5]);
  assert.throws(() => readLeaveProbabilities([[0.2, 0.8]], 2));
  const query = { hour: 8, minutesAway: 12, lightMinutes: 500, lastBailed: false };
  const csv = attemptsToCsv(rows, [query, { ...query, minutesAway: 2 }]);
  assert.match(csv.xTrain, /^hour,minutes_away/);
  assert.match(csv.yTrain, /^left\n/);
  assert.equal(csv.xTest.split("\n").length, 3);
});

test("the spoken brief stays short enough to hear once", () => {
  const brief = cleanBrief(
    composeBrief({
      bench: {
        id: "dhanmondi",
        name: "the lakeside step",
        area: "Dhanmondi Lake",
        minutesAway: 8,
        shade: "water",
        note: "close",
      },
      lightMinutes: 40,
      leaveProbability: 0.7,
    }),
  );
  assert.ok(brief.split(/\s+/).length <= 40);
  assert.match(brief, /Pocket the phone/);
});

test("streak counts consecutive Dhaka days with a real sit", () => {
  const base = {
    benchId: "rooftop",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "sat" as const,
    brief: "",
    model: "composer",
    leaveProbability: 0.5,
    predictionSource: "baseline",
    practice: false,
    sitSeconds: 720,
    hour: 8,
    minutesAway: 2,
    lightMinutes: 10,
    lastBailed: false,
  };
  const today = dhakaDayKey(new Date().toISOString());
  const day = (offset: number) => {
    const noon = new Date(`${today}T12:00:00+06:00`);
    noon.setDate(noon.getDate() - offset);
    return noon.toISOString();
  };
  const walks: Walk[] = [0, 1, 2].map((offset) => ({
    ...base,
    id: `w-${offset}`,
    endedAt: day(offset),
  }));
  assert.equal(sitStreak(walks), 3);
  assert.equal(sitStreak(walks.filter((walk) => walk.id !== "w-1")), 1);
});

test("leaderboard ranks benches by real sits", () => {
  const area = (id: string) => (id === "a" ? "Park A" : "Park B");
  const walks: Walk[] = [
    {
      id: "1",
      benchId: "a",
      createdAt: "",
      status: "sat",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 0,
      hour: 0,
      minutesAway: 0,
      lightMinutes: 0,
      lastBailed: false,
    },
    {
      id: "2",
      benchId: "b",
      createdAt: "",
      status: "sat",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 0,
      hour: 0,
      minutesAway: 0,
      lightMinutes: 0,
      lastBailed: false,
    },
    {
      id: "3",
      benchId: "a",
      createdAt: "",
      status: "bailed",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 0,
      hour: 0,
      minutesAway: 0,
      lightMinutes: 0,
      lastBailed: false,
    },
  ];
  const rows = benchLeaderboard(walks, area);
  assert.equal(rows[0].benchId, "a");
  assert.equal(rows[0].sits, 1);
  assert.equal(rows[0].bails, 1);
});

test("player leaderboard groups by nickname", () => {
  const base = {
    benchId: "rooftop",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "sat" as const,
    brief: "",
    model: "",
    leaveProbability: 0,
    predictionSource: "",
    practice: false,
    sitSeconds: 0,
    hour: 8,
    minutesAway: 2,
    lightMinutes: 10,
    lastBailed: false,
    endedAt: new Date().toISOString(),
  };
  const walks: Walk[] = [
    { ...base, id: "1", nickname: "Atlas" },
    { ...base, id: "2", nickname: "atlas" },
    { ...base, id: "3", nickname: "Other" },
  ];
  const rows = playerLeaderboard(walks);
  assert.equal(rows[0].nickname, "Atlas");
  assert.equal(rows[0].sits, 2);
  assert.equal(sanitizeNickname("  hi!!!  "), "hi");
});

test("qualify turns composer real sits into exportable rows", () => {
  const walk: Walk = {
    id: "x",
    benchId: "rooftop",
    createdAt: "2026-01-01T06:00:00.000Z",
    status: "sat",
    brief: "Walk to the roof. Pocket the phone when you sit.",
    model: "composer",
    leaveProbability: 0.6,
    predictionSource: "baseline",
    practice: false,
    sitSeconds: 720,
    hour: 12,
    minutesAway: 2,
    lightMinutes: 90,
    lastBailed: false,
  };
  assert.equal(walkQualifiesForTinkerExport(walk), false);
  const patch = qualifyWalkPatch(walk, bench("rooftop"), "google/gemma-3-4b-it");
  assert.ok(patch?.model === "google/gemma-3-4b-it");
  assert.equal(walkQualifiesForTinkerExport({ ...walk, ...patch }), true);
});

test("a doorstep sit stays in the close pool and picks the nearest bench", () => {
  const pool = eligibleBenches({ lightMinutes: 400, lastBailed: false, closeOnly: true });
  assert.ok(pool.every((item) => item.minutesAway <= 8));
  const chosen = chooseNearest([
    { bench: bench("ramna"), probability: 0.9 },
    { bench: bench("rooftop"), probability: 0.4 },
    { bench: bench("dhanmondi"), probability: 0.8 },
  ]);
  assert.equal(chosen.bench.id, "rooftop");
  assert.equal(sitPlan("doorstep").sitSeconds, 360);
  assert.equal(parseNeed("nope"), "outside");
});

test("doorstep and together briefs stay short and name the help", () => {
  const facts = {
    bench: bench("rooftop"),
    lightMinutes: 40,
    leaveProbability: 0.4,
  };
  const door = composeBrief({ ...facts, need: "doorstep" });
  const together = composeBrief({ ...facts, need: "together" });
  assert.match(door, /Six quiet minutes/);
  assert.match(together, /someone is with you/i);
  assert.ok(cleanBrief(door).split(/\s+/).length <= 40);
  assert.equal(companionLine("together", bench("rooftop"))?.includes("do not have to talk"), true);
  assert.equal(companionLine("outside", bench("rooftop")), undefined);
});

test("the check-in note has a time and no coordinates", () => {
  const note = checkInText(bench("dhanmondi"), 12 * 60, new Date("2026-10-06T10:00:00+06:00"), 8);
  assert.match(note, /lakeside step/);
  assert.match(note, /until about/);
  assert.doesNotMatch(note, /\d+\.\d+/);
});

test("after-sit copy stays kind and last week's minutes add up", () => {
  assert.match(
    afterSitLine({
      need: "doorstep",
      practice: false,
      lastBailed: true,
      streak: 0,
      minutesThisWeek: 6,
    }),
    /enough/,
  );
  const now = new Date("2026-10-06T12:00:00+06:00");
  const walks: Walk[] = [
    {
      id: "1",
      benchId: "rooftop",
      createdAt: "2026-10-05T06:00:00.000Z",
      status: "bailed",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 360,
      hour: 12,
      minutesAway: 2,
      lightMinutes: 40,
      lastBailed: false,
    },
    {
      id: "2",
      benchId: "rooftop",
      createdAt: "2026-10-06T06:00:00.000Z",
      endedAt: "2026-10-06T06:12:00.000Z",
      status: "sat",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 360,
      hour: 12,
      minutesAway: 2,
      lightMinutes: 40,
      lastBailed: true,
    },
  ];
  assert.equal(lastWalkBailed(walks), false);
  assert.equal(sitMinutesThisWeek(walks, now), 6);
});

test("bench choice comes with a plain reason judges can quote", () => {
  assert.match(
    explainBenchChoice({
      need: "doorstep",
      lightMinutes: 400,
      lastBailed: false,
      minutesAway: 2,
      probability: 0.8,
      nearest: true,
    }),
    /closest/i,
  );
  assert.match(
    explainBenchChoice({
      need: "outside",
      lightMinutes: 400,
      lastBailed: true,
      minutesAway: 2,
      probability: 0.5,
      nearest: false,
    }),
    /stayed in last time/i,
  );
});

test("sit story export has no coordinates", () => {
  const story = formatSitStory({
    benchName: "the roof",
    benchArea: "your building",
    minutesAway: 2,
    sitMinutes: 12,
    benchReason: "You stayed in last time, so every option today stays close.",
    debrief: "Warm brick.",
    model: "gemma3:4b",
    predictionSource: "tabpfn",
  });
  assert.match(story, /Warm brick/);
  assert.match(story, /not tracked/i);
  assert.doesNotMatch(story, /\d+\.\d+/);
});

test("home copy states what Stillbench does in plain language", () => {
  assert.match(homeHeadline(false), /twelve minutes/i);
  assert.match(HOME_PURPOSE, /bench/i);
  assert.match(HOME_PURPOSE, /No GPS/i);
});

test("a dedication is optional, short, and stripped of links", () => {
  assert.equal(sanitizeDedication(""), undefined);
  assert.equal(sanitizeDedication("  Ammu  "), "Ammu");
  assert.equal(sanitizeDedication("for https://spam.example/x today"), "for today");
  assert.equal(sanitizeDedication("a".repeat(120))?.length, 80);
  assert.equal(noticePrompt("together"), "What did you both notice that wasn't a screen?");
  assert.equal(noticePrompt("doorstep"), "What was here, even if it was only the roof?");
  assert.equal(noticePrompt("outside"), "What was here that isn't a screen?");
});

test("briefs, check-ins, and after-sit copy name who the sit is for", () => {
  const facts = {
    bench: bench("rooftop"),
    lightMinutes: 40,
    leaveProbability: 0.4,
    dedication: "Ammu",
  };
  const spoken = composeBrief(facts);
  assert.match(spoken, /This sit is for Ammu/);
  assert.ok(cleanBrief(spoken).split(/\s+/).length <= 40);
  assert.match(briefPrompt(facts), /This sit is for: "Ammu"/);
  const note = checkInText(
    bench("dhanmondi"),
    12 * 60,
    new Date("2026-10-06T10:00:00+06:00"),
    8,
    "Ammu",
  );
  assert.match(note, /This sit is for Ammu/);
  assert.doesNotMatch(note, /\d+\.\d+/);
  assert.match(
    afterSitLine({
      need: "outside",
      practice: false,
      lastBailed: false,
      streak: 0,
      minutesThisWeek: 12,
      dedication: "Ammu",
      area: "the roof",
    }),
    /You sat at the roof for Ammu/,
  );
});

test("home remembers the last real sit, including who it was for", () => {
  const now = new Date("2026-10-06T12:00:00+06:00");
  const walks: Walk[] = [
    {
      id: "practice",
      benchId: "dhanmondi",
      createdAt: "2026-10-06T08:00:00.000Z",
      endedAt: "2026-10-06T08:01:00.000Z",
      status: "sat",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: true,
      sitSeconds: 20,
      hour: 14,
      minutesAway: 8,
      lightMinutes: 40,
      lastBailed: false,
      dedication: "should not appear",
    },
    {
      id: "real",
      benchId: "rooftop",
      createdAt: "2026-10-05T06:00:00.000Z",
      endedAt: "2026-10-05T06:12:00.000Z",
      status: "sat",
      brief: "",
      model: "",
      leaveProbability: 0,
      predictionSource: "",
      practice: false,
      sitSeconds: 720,
      hour: 12,
      minutesAway: 2,
      lightMinutes: 40,
      lastBailed: false,
      dedication: "Ammu",
    },
  ];
  const area = (id: string) => (id === "rooftop" ? "the roof" : "the lake");
  assert.equal(
    lastSitMemory(walks, area, now),
    "You sat at the roof yesterday, for Ammu.",
  );
});

test("Tinker chat body uses a boolean reasoning_effort Qwen 3.5 accepts", () => {
  const body = tinkerChatBody("tinker://example/sampler_weights/stillbench-briefs", [
    { role: "user", content: "roof" },
  ]);
  assert.equal(body.reasoning_effort, false);
  assert.equal(body.separate_reasoning, true);
  assert.match(TINKER_OAI, /tinker-prod\/oai\/api\/v1$/);
  assert.equal(
    tinkerReplyText({
      choices: [{ message: { content: "", reasoning_content: "Thinking Process" } }],
    }),
    "",
  );
  assert.equal(
    tinkerReplyText({ choices: [{ message: { content: " Pocket the phone. " } }] }),
    "Pocket the phone.",
  );
  assert.match(
    tinkerErrorNote(400, JSON.stringify({ detail: "reasoning_effort is not supported for model x. This model accepts true or false." })),
    /accepts true or false/,
  );
});

test("blank OLLAMA_API_KEY counts as missing on remote hosts", () => {
  const prior = process.env.OLLAMA_API_KEY;
  const priorUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = "https://openrouter.ai/api/v1";
  process.env.OLLAMA_API_KEY = "   ";
  assert.equal(ollamaApiKey(), undefined);
  assert.equal(gemmaInferenceReady(), false);
  process.env.OLLAMA_API_KEY = "sk-test";
  assert.equal(ollamaApiKey(), "sk-test");
  assert.equal(gemmaInferenceReady(), true);
  if (prior === undefined) delete process.env.OLLAMA_API_KEY;
  else process.env.OLLAMA_API_KEY = prior;
  if (priorUrl === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = priorUrl;
});
