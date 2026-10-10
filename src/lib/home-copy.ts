export const HOME_PURPOSE =
  "Stillbench picks a nearby bench, speaks a short departure brief, then times your sit while the phone stays in your pocket. No GPS. No feed.";

export const HOME_PURPOSE_BAILED =
  "Staying in counts. Stillbench can still time a short sit at the closest bench—the roof or stoop counts.";

export const HOME_HOW =
  "Tap a button below, listen once, then pocket the phone until the chime.";

export function homeHeadline(bailed: boolean) {
  return bailed ? "The street can wait." : "Sit outside for twelve minutes.";
}

export const BENCH_STEP =
  "Walk to this bench, tap I'm sitting, then pocket the phone. Stillbench only keeps time—it does not track where you go.";
