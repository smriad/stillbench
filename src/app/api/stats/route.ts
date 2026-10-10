import { allBenches } from "@/lib/benches";
import { lastSitMemory, lastWalkBailed, publicEchoes, realSits, sitMinutesThisWeek, sitStreak } from "@/lib/stats";
import { readAllWalks } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const walks = await readAllWalks();
  const benches = await allBenches();
  const area = (benchId: string) =>
    benches.find((bench) => bench.id === benchId)?.area ?? "a bench";

  return Response.json({
    streak: sitStreak(walks),
    realSits: realSits(walks),
    minutesThisWeek: sitMinutesThisWeek(walks),
    lastBailed: lastWalkBailed(walks),
    lastSit: lastSitMemory(walks, area),
    echoes: publicEchoes(walks, area),
  });
}
