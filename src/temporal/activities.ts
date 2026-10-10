import { getWalk, type WalkStatus } from "../lib/store";
import { moveWalk } from "../lib/walks";

export async function closeWalk(
  walkId: string,
  action: "sat" | "bailed",
  expected: WalkStatus,
) {
  const walk = await getWalk(walkId);
  if (!walk || walk.status !== expected) return walk?.status ?? "missing";
  const moved = await moveWalk(walkId, action, { endedBy: "timer" });
  return moved.ok ? moved.walk.status : moved.error;
}
