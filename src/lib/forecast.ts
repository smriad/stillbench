import { predictLeave, type AttemptRow, type LeaveQuery } from "./predict";
import { tabpfnLeaveProbabilities, tabpfnReady } from "./tabpfn";
import { recordHealth } from "./health";
import { traced } from "./trace";

export type LeaveForecast = {
  probabilities: number[];
  source: "baseline" | "tabpfn";
  neighbors: number;
};

export async function forecastLeave(
  rows: AttemptRow[],
  queries: LeaveQuery[],
): Promise<LeaveForecast> {
  const baseline: LeaveForecast = {
    probabilities: queries.map((query) => predictLeave(rows, query).probability),
    source: "baseline",
    neighbors: rows.length,
  };
  const apiKey = process.env.PRIORLABS_API_KEY;
  if (!apiKey || !tabpfnReady(rows)) return baseline;

  try {
    const probabilities = await traced(
      "tabpfn.predict",
      { "tabpfn.train_rows": rows.length, "tabpfn.test_rows": queries.length },
      () =>
        Promise.race([
          tabpfnLeaveProbabilities(apiKey, rows, queries),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("TabPFN timed out")), 45_000);
          }),
        ]),
    );
    await recordHealth("tabpfn", true, `scored ${queries.length} benches on ${rows.length} rows`);
    return { probabilities, source: "tabpfn", neighbors: rows.length };
  } catch (error) {
    console.error("TabPFN was unavailable. Using the local baseline.", error);
    await recordHealth("tabpfn", false, error instanceof Error ? error.message : String(error));
    return baseline;
  }
}
