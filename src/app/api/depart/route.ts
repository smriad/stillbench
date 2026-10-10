import { allBenches, findBench } from "@/lib/benches";
import { sanitizeDedication } from "@/lib/meaning";
import { parseNeed } from "@/lib/need";
import { getWalk } from "@/lib/store";
import { mastra } from "@/mastra";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    practice?: boolean;
    need?: string;
    dedication?: string;
  };

  const run = await mastra.getWorkflow("departWorkflow").createRun();
  const result = await run.start({
    inputData: {
      practice: Boolean(body.practice),
      need: parseNeed(body.need),
      dedication: sanitizeDedication(body.dedication),
    },
  });
  if (result.status !== "success") {
    console.error("The departure workflow did not finish.", result);
    return Response.json({ error: "The brief did not come back." }, { status: 500 });
  }

  const walk = await getWalk(result.result.walkId);
  if (!walk) return Response.json({ error: "The walk was not saved." }, { status: 500 });

  return Response.json({
    walk,
    bench: await findBench(walk.benchId),
    spoken: result.result.spoken,
    durable: result.result.durable,
    prediction: {
      probability: walk.leaveProbability,
      source: walk.predictionSource,
    },
  });
}

export async function GET() {
  const benchesById = Object.fromEntries(
    (await allBenches()).map((bench) => [bench.id, bench]),
  );
  return Response.json({ benches: benchesById });
}
