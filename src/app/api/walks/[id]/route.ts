import { rememberDebrief } from "@/lib/backboard";
import { sanitizeNickname } from "@/lib/leaderboard";
import { exportModelLabel, qualifyWalkPatch } from "@/lib/walk-qualify";
import { findBench } from "@/lib/benches";
import { recordSitEvent } from "@/lib/tiger";
import { getWalk, updateWalk, type WalkStatus } from "@/lib/store";
import { signalWalk } from "@/lib/temporal";
import { moveWalk } from "@/lib/walks";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const walk = await getWalk(id);
  if (!walk) return Response.json({ error: "Walk not found." }, { status: 404 });
  return Response.json({ walk, bench: await findBench(walk.benchId) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const walk = await getWalk(id);
  if (!walk) return Response.json({ error: "Walk not found." }, { status: 404 });

  const body = (await request.json()) as {
    action?: WalkStatus;
    debrief?: string;
    outsideConfirmed?: boolean;
    shareDebrief?: boolean;
    nickname?: string;
  };

  if (walk.status === "sat" && !body.action) {
    const patch: {
      debrief?: string;
      outsideConfirmed?: boolean;
      shareDebrief?: boolean;
      nickname?: string;
    } = {};
    if (body.debrief?.trim()) patch.debrief = body.debrief.trim().slice(0, 280);
    if (body.outsideConfirmed) patch.outsideConfirmed = true;
    if (body.shareDebrief) patch.shareDebrief = true;
    const nickname = sanitizeNickname(body.nickname ?? "");
    if (nickname) patch.nickname = nickname;
    const benchForQualify = await findBench(walk.benchId);
    const qualify = qualifyWalkPatch(
      { ...walk, ...patch },
      benchForQualify,
      exportModelLabel(),
    );
    if (qualify) Object.assign(patch, qualify);
    const updated =
      Object.keys(patch).length > 0 ? await updateWalk(id, patch) : walk;
    const bench = await findBench(walk.benchId);
    if (updated && patch.debrief && bench) {
      await rememberDebrief(bench.area, patch.debrief);
      await recordSitEvent(updated);
    }
    return Response.json({ walk: updated, bench });
  }

  if (!body.action) {
    return Response.json(
      { error: `Cannot move from ${walk.status} to nothing.` },
      { status: 409 },
    );
  }

  const moved = await moveWalk(id, body.action, { debrief: body.debrief });
  if (!moved.ok) return Response.json({ error: moved.error }, { status: moved.status });
  if (moved.walk.durable) await signalWalk(id, body.action);

  return Response.json({ walk: moved.walk, bench: await findBench(moved.walk.benchId) });
}
