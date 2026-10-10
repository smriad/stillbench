import { recordAttempt } from "./attempts";
import { findBench } from "./benches";
import { recordSitEvent } from "./tiger";
import { getWalk, openWalks, updateWalk, type Walk, type WalkStatus } from "./store";
import { exportModelLabel, qualifyWalkPatch } from "./walk-export";

export const allowedMoves: Record<WalkStatus, WalkStatus[]> = {
  briefed: ["left", "bailed"],
  left: ["sitting", "bailed"],
  sitting: ["sat", "bailed"],
  sat: [],
  bailed: [],
};

export const STALE_HOURS = 3;

export type MoveResult =
  | { ok: true; walk: Walk }
  | { ok: false; status: 404 | 409; error: string };

export async function moveWalk(
  id: string,
  action: WalkStatus,
  options: { endedBy?: Walk["endedBy"]; debrief?: string; now?: Date } = {},
): Promise<MoveResult> {
  const walk = await getWalk(id);
  if (!walk) return { ok: false, status: 404, error: "Walk not found." };
  if (!allowedMoves[walk.status].includes(action)) {
    return {
      ok: false,
      status: 409,
      error: `Cannot move from ${walk.status} to ${action}.`,
    };
  }

  const now = options.now ?? new Date();
  const patch: Partial<Walk> = { status: action };
  if (action === "sitting") patch.sittingStartedAt = now.toISOString();
  if (action === "sat" || action === "bailed") {
    patch.endedAt = now.toISOString();
    patch.endedBy = options.endedBy ?? "you";
  }
  const debrief = options.debrief?.trim().slice(0, 280);
  if (debrief) patch.debrief = debrief;

  if (action === "sat" && !walk.practice) {
    const qualify = qualifyWalkPatch(
      { ...walk, ...patch },
      await findBench(walk.benchId),
      exportModelLabel(),
    );
    if (qualify) Object.assign(patch, qualify);
  }

  const updated = await updateWalk(id, patch);
  if (!updated) return { ok: false, status: 404, error: "Walk not found." };

  if ((action === "sat" || action === "bailed") && !updated.practice) {
    await recordAttempt({
      hour: updated.hour,
      minutesAway: updated.minutesAway,
      lightMinutes: updated.lightMinutes,
      lastBailed: updated.lastBailed,
      left: action === "sat",
    });
  }
  if (action === "sat" || action === "bailed") {
    await recordSitEvent(updated);
  }

  return { ok: true, walk: updated };
}

export async function closeStaleWalks(now = new Date()) {
  const cutoff = now.getTime() - STALE_HOURS * 60 * 60 * 1000;
  for (const walk of await openWalks()) {
    if (new Date(walk.createdAt).getTime() > cutoff) continue;
    const sitEnds = walk.sittingStartedAt
      ? new Date(walk.sittingStartedAt).getTime() + walk.sitSeconds * 1000
      : Infinity;
    await moveWalk(walk.id, sitEnds <= now.getTime() ? "sat" : "bailed", {
      endedBy: "timer",
      now,
    });
  }
}
