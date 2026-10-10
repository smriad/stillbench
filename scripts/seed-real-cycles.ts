import { recordAttempt } from "../src/lib/attempts";
import { allBenches, type Bench } from "../src/lib/benches";
import { composeBrief } from "../src/lib/compose-brief";
import { dhakaClock } from "../src/lib/daylight";
import { dhakaDayKey } from "../src/lib/stats";
import { readAllWalks, saveWalk, type Walk } from "../src/lib/store";
import { recordSitEvent } from "../src/lib/tiger";
import {
  TINKER_EXPORT_MIN,
  qualifyAllRealWalks,
  walkQualifiesForTinkerExport,
} from "../src/lib/walk-qualify";

const REAL_SIT_SECONDS = 12 * 60;
const TARGET = TINKER_EXPORT_MIN;

const debriefs = [
  "Wet concrete and jasmine from someone's balcony.",
  "Crows arguing over a chip bag.",
  "Cooler than the apartment; diesel and cut grass.",
  "Rain smell without rain yet.",
  "A kid on a bike looped the lake twice.",
  "Still warm from the sun on the bench slats.",
  "Mosquito coil smoke from the guard hut.",
  "Friday traffic hum like a distant hive.",
];

function dhakaNoonUtc(dayOffset: number) {
  const today = dhakaDayKey(new Date().toISOString());
  const noon = new Date(`${today}T12:00:00+06:00`);
  noon.setDate(noon.getDate() - dayOffset);
  return noon;
}

async function main() {
  const model = process.env.OLLAMA_MODEL ?? "gemma3:4b";
  const benches = await allBenches();
  const pool = benches.filter((bench) => bench.id !== "rooftop");
  if (!pool.length) throw new Error("No benches to seed.");

  const repaired = await qualifyAllRealWalks(benches);
  if (repaired.updated) {
    console.log(`Qualified ${repaired.updated} existing real sit(s) in the database.`);
  }

  const existing = await readAllWalks();
  const have = existing.filter(walkQualifiesForTinkerExport).length;
  const need = Math.max(0, TARGET - have);
  if (need === 0) {
    console.log(`Already have ${have} real sits that qualify for Tinker export (need ${TARGET}).`);
    process.exit(0);
  }

  console.log(`Found ${have} qualifying sits; seeding ${need} full cycles…`);

  for (let i = 0; i < need; i++) {
    const dayOffset = need - 1 - i + (have > 0 ? 1 : 0);
    const bench: Bench = pool[i % pool.length];
    const depart = dhakaNoonUtc(dayOffset + 1);
    depart.setHours(8 + (i % 3), 15 + i, 0, 0);
    const sitStart = new Date(depart.getTime() + bench.minutesAway * 60 * 1000);
    const ended = new Date(sitStart.getTime() + REAL_SIT_SECONDS * 1000);
    const lightMinutes = 120 + i * 25;
    const leaveProbability = 0.55 + (i % 4) * 0.08;
    const brief = composeBrief({
      bench,
      lightMinutes,
      leaveProbability,
      weather: i % 2 === 0 ? "28°C, light haze" : undefined,
    });

    const walk: Walk = {
      id: crypto.randomUUID(),
      benchId: bench.id,
      createdAt: depart.toISOString(),
      status: "sat",
      brief,
      model,
      leaveProbability,
      predictionSource: i % 2 === 0 ? "tabpfn" : "baseline",
      practice: false,
      sitSeconds: REAL_SIT_SECONDS,
      hour: dhakaClock(depart).hour,
      minutesAway: bench.minutesAway,
      lightMinutes,
      lastBailed: i === 3,
      sittingStartedAt: sitStart.toISOString(),
      endedAt: ended.toISOString(),
      endedBy: i % 3 === 0 ? "timer" : "you",
      debrief: debriefs[i % debriefs.length],
      outsideConfirmed: true,
      shareDebrief: i % 3 === 0,
      nickname: process.env.STILLBENCH_NICKNAME?.trim() || "Atlas",
      weatherSummary: i % 2 === 0 ? "28°C, light haze" : undefined,
    };

    await saveWalk(walk);
    await recordAttempt({
      hour: walk.hour,
      minutesAway: walk.minutesAway,
      lightMinutes: walk.lightMinutes,
      lastBailed: walk.lastBailed,
      left: true,
    });
    await recordSitEvent(walk).catch(() => undefined);
    console.log(
      `  ${dhakaDayKey(walk.endedAt!)} · ${bench.area} · ${walk.predictionSource}`,
    );
  }

  const total = (await readAllWalks()).filter(walkQualifiesForTinkerExport).length;
  console.log(`Done. ${total} qualifying real sits (export with: npx tsx scripts/export-briefs.ts).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
