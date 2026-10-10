import { markDeviceSeen } from "@/lib/integrations";
import { latestWalk } from "@/lib/store";

export const dynamic = "force-dynamic";

const DONE_SHOWS_FOR_MS = 2 * 60 * 1000;

function line(text: string) {
  return new Response(`${text}\n`, {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = process.env.STILLBENCH_DEVICE_TOKEN;
  if (!token) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response(null, { status: 401 });
  }
  markDeviceSeen();

  const walk = await latestWalk();
  const now = Date.now();
  if (!walk) return line("idle 0");

  if (walk.status === "sitting" && walk.sittingStartedAt) {
    const ends = new Date(walk.sittingStartedAt).getTime() + walk.sitSeconds * 1000;
    return line(`sitting ${Math.max(0, Math.ceil((ends - now) / 1000))}`);
  }
  if (walk.status === "briefed" || walk.status === "left") {
    return line(`walking ${walk.minutesAway * 60}`);
  }
  if (
    walk.status === "sat" &&
    walk.endedAt &&
    now - new Date(walk.endedAt).getTime() < DONE_SHOWS_FOR_MS
  ) {
    return line("done 0");
  }
  return line("idle 0");
}
