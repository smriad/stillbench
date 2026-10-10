import { Client, Connection } from "@temporalio/client";
import type { WalkStatus } from "./store";
import { TASK_QUEUE, temporalConnectionOptions, temporalEnabled } from "./temporal-config";

const globalForTemporal = globalThis as unknown as { stillbenchTemporal?: Promise<Client> };

function client() {
  globalForTemporal.stillbenchTemporal ??= Connection.connect(
    temporalConnectionOptions(),
  ).then(
    (connection) =>
      new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "default" }),
  );
  return globalForTemporal.stillbenchTemporal;
}

export async function startWalkWorkflow(input: {
  walkId: string;
  sitSeconds: number;
  minutesAway: number;
}) {
  if (!temporalEnabled()) return false;
  try {
    await (await client()).workflow.start("walkWorkflow", {
      taskQueue: TASK_QUEUE,
      workflowId: `walk-${input.walkId}`,
      args: [input],
    });
    return true;
  } catch (error) {
    console.error("Temporal did not take the walk. The phone timer will carry it.", error);
    globalForTemporal.stillbenchTemporal = undefined;
    return false;
  }
}

export async function signalWalk(walkId: string, status: WalkStatus) {
  if (!temporalEnabled()) return;
  try {
    await (await client()).workflow.getHandle(`walk-${walkId}`).signal("move", status);
  } catch (error) {
    console.error("Temporal missed a walk update.", error);
  }
}
