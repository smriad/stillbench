export type AttemptRow = {
  hour: number;
  minutesAway: number;
  lightMinutes: number;
  lastBailed: boolean;
  left: boolean;
};

export type LeaveQuery = Omit<AttemptRow, "left">;

export type LeavePrediction = {
  probability: number;
  source: "baseline" | "tabpfn";
  neighbors: number;
};

function clamp(value: number) {
  return Math.min(0.92, Math.max(0.08, value));
}

export function predictLeave(
  rows: AttemptRow[],
  query: LeaveQuery,
): LeavePrediction {
  const neighbors = rows.filter(
    (row) =>
      Math.abs(row.hour - query.hour) <= 2 &&
      Math.abs(row.minutesAway - query.minutesAway) <= 6,
  );

  if (neighbors.length >= 3) {
    const rate =
      neighbors.filter((row) => row.left).length / neighbors.length;
    const penalty = query.lastBailed ? 0.12 : 0;
    return {
      probability: clamp(rate - penalty),
      source: "baseline",
      neighbors: neighbors.length,
    };
  }

  const globalRate = rows.length
    ? rows.filter((row) => row.left).length / rows.length
    : 0.55;
  const distanceDrag = query.minutesAway * 0.012;
  const darkDrag = query.lightMinutes < 30 ? 0.2 : 0;
  const bailDrag = query.lastBailed ? 0.15 : 0;

  return {
    probability: clamp(globalRate - distanceDrag - darkDrag - bailDrag),
    source: "baseline",
    neighbors: neighbors.length,
  };
}
