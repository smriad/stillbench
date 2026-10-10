import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bench } from "../src/lib/benches";
import { dataFile } from "../src/lib/paths";

const WALK_METERS_PER_MINUTE = 80;
const DETOUR = 1.3;
const MAX_MINUTES = 25;

type Place = {
  title?: string;
  type?: string;
  types?: string[];
  address?: string;
  rating?: number;
  gps_coordinates?: { latitude: number; longitude: number };
};

function metersBetween(a: [number, number], b: [number, number]) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const OUTDOORS = /\b(park|garden|lake|botanical|nature|playground|square|plaza|waterfront|promenade)\b/;
const NOT_OUTDOORS = /\b(center|centre|store|shop|apartment|building|spa|club|hotel|restaurant|parking|school)\b/;

function isOutdoors(place: Place) {
  const kinds = [place.type, ...(place.types ?? [])].filter(Boolean).join(" ").toLowerCase();
  return OUTDOORS.test(kinds) && !NOT_OUTDOORS.test(kinds);
}

function shadeFor(place: Place): Bench["shade"] {
  const kind = [place.title, place.type, ...(place.types ?? [])].join(" ").toLowerCase();
  if (/lake|river|pond|water|canal/.test(kind)) return "water";
  if (/park|garden|forest|botanical|grove/.test(kind)) return "trees";
  return "open";
}

const names: Record<Bench["shade"], string> = {
  water: "a bench by the water",
  trees: "a shaded bench",
  open: "an open bench",
};

async function main() {
  const apiKey = process.env.SERPAPI_API_KEY;
  const home = process.env.STILLBENCH_HOME?.split(",").map(Number);
  if (!apiKey || !home || home.length !== 2 || home.some(Number.isNaN)) {
    throw new Error('Set SERPAPI_API_KEY and STILLBENCH_HOME="lat,lng" first.');
  }
  const origin: [number, number] = [home[0], home[1]];

  const found = new Map<string, Bench>();
  for (const query of ["park", "lake park", "garden"]) {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({
      engine: "google_maps",
      type: "search",
      q: query,
      ll: `@${origin[0]},${origin[1]},15z`,
      api_key: apiKey,
    }).toString();

    const response = await fetch(url);
    if (!response.ok) throw new Error(`SerpApi said ${response.status}.`);
    const payload = (await response.json()) as { local_results?: Place[] };

    for (const place of payload.local_results ?? []) {
      if (!place.title || !place.gps_coordinates || !isOutdoors(place)) continue;
      const meters = metersBetween(origin, [
        place.gps_coordinates.latitude,
        place.gps_coordinates.longitude,
      ]);
      const minutesAway = Math.max(
        2,
        Math.round((meters * DETOUR) / WALK_METERS_PER_MINUTE),
      );
      if (minutesAway > MAX_MINUTES) continue;

      const id = place.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const shade = shadeFor(place);
      found.set(id, {
        id,
        name: names[shade],
        area: place.title,
        minutesAway,
        shade,
        note: [place.type, place.rating ? `rated ${place.rating}` : ""]
          .filter(Boolean)
          .join(", "),
        source: "serpapi",
      });
    }
  }

  const benches = [...found.values()].sort((a, b) => a.minutesAway - b.minutesAway);
  const out = dataFile("benches.json");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(benches, null, 2));
  console.log(`Saved ${benches.length} benches within ${MAX_MINUTES} minutes to ${out}`);
  for (const bench of benches) {
    console.log(`  ${bench.minutesAway} min  ${bench.area}  (${bench.shade})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
