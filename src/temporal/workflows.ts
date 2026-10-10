import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type * as activities from "./activities";

type WalkStatus = "briefed" | "left" | "sitting" | "sat" | "bailed";

export const moveSignal = defineSignal<[WalkStatus]>("move");

const { closeWalk } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 5 },
});

export type WalkWorkflowInput = {
  walkId: string;
  sitSeconds: number;
  minutesAway: number;
};

const DEPARTURE_GRACE_MINUTES = 45;

export async function walkWorkflow(input: WalkWorkflowInput): Promise<string> {
  let status: WalkStatus = "briefed";
  setHandler(moveSignal, (next) => {
    status = next;
  });
  const finished = () => status === "sat" || status === "bailed";

  const departed = await condition(
    () => status !== "briefed",
    `${DEPARTURE_GRACE_MINUTES} minutes`,
  );
  if (!departed) {
    await closeWalk(input.walkId, "bailed", "briefed");
    return "bailed: never left";
  }
  if (finished()) return status;

  const arrived = await condition(
    () => status !== "left",
    `${input.minutesAway * 3 + 15} minutes`,
  );
  if (!arrived) {
    await closeWalk(input.walkId, "bailed", "left");
    return "bailed: never sat";
  }
  if (finished()) return status;

  const endedEarly = await condition(finished, `${input.sitSeconds} seconds`);
  if (endedEarly) return status;

  await closeWalk(input.walkId, "sat", "sitting");
  return "sat: the timer finished the sit";
}
