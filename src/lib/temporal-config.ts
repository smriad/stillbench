export const TASK_QUEUE = "stillbench-walks";

export function temporalEnabled() {
  return Boolean(process.env.TEMPORAL_ADDRESS);
}

export function temporalConnectionOptions() {
  const apiKey = process.env.TEMPORAL_API_KEY;
  return {
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    ...(apiKey ? { tls: true, apiKey } : {}),
  };
}
