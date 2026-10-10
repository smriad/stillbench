import path from "node:path";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { TASK_QUEUE, temporalConnectionOptions } from "../lib/temporal-config";

async function run() {
  if (process.env.RENDER && (!process.env.TEMPORAL_ADDRESS || !process.env.MONGODB_URI)) {
    throw new Error(
      "On Render the worker needs TEMPORAL_ADDRESS (Temporal Cloud) and MONGODB_URI, because it cannot see the web service's disk.",
    );
  }
  const connection = await NativeConnection.connect(temporalConnectionOptions());
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: path.join(process.cwd(), "src/temporal/workflows.ts"),
    activities,
  });
  console.log(`Stillbench worker listening on ${TASK_QUEUE}`);
  await worker.run();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
