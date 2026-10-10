import { allBenches } from "@/lib/benches";
import { benchLeaderboard, playerLeaderboard } from "@/lib/leaderboard";
import { publicEchoes, realSits } from "@/lib/stats";
import { readAllWalks } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const walks = await readAllWalks();
  const benches = await allBenches();
  const area = (benchId: string) =>
    benches.find((bench) => bench.id === benchId)?.area ?? "a bench";

  return Response.json({
    totalSits: realSits(walks),
    benches: benchLeaderboard(walks, area),
    players: playerLeaderboard(walks),
    echoes: publicEchoes(walks, area, 8),
  });
}
