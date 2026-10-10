import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { allBenches } from "../src/lib/benches";
import { BRIEF_INSTRUCTIONS, briefPrompt } from "../src/lib/compose-brief";
import { dataFile } from "../src/lib/paths";
import { walkQualifiesForTinkerExport } from "../src/lib/walk-qualify";
import { readAllWalks } from "../src/lib/store";

export async function exportBriefs() {
  const known = await allBenches();
  const walks = await readAllWalks();
  const examples = walks
    .filter(walkQualifiesForTinkerExport)
    .flatMap((walk) => {
      const bench = known.find((item) => item.id === walk.benchId);
      if (!bench) return [];
      return [
        {
          messages: [
            { role: "system", content: BRIEF_INSTRUCTIONS },
            {
              role: "user",
              content: briefPrompt({
                bench,
                lightMinutes: walk.lightMinutes,
                leaveProbability: walk.leaveProbability,
              }),
            },
            { role: "assistant", content: walk.brief },
          ],
        },
      ];
    });

  const out = dataFile("tinker", "briefs.jsonl");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, examples.map((example) => JSON.stringify(example)).join("\n"));
  return { count: examples.length, out };
}

async function main() {
  const { count, out } = await exportBriefs();
  console.log(`Wrote ${count} briefs that got you to sit to ${out}`);
}

const cli = process.argv[1]?.includes("export-briefs");
if (cli) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
