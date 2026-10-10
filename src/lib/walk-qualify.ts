import type { Bench } from "./benches";
import { readAllWalks, updateWalk } from "./store";
import {
  exportModelLabel,
  qualifyWalkPatch,
  walkQualifiesForTinkerExport,
} from "./walk-export";

export {
  TINKER_EXPORT_MIN,
  exportModelLabel,
  qualifyWalkPatch,
  walkQualifiesForTinkerExport,
} from "./walk-export";

export async function countExportableWalks() {
  const walks = await readAllWalks();
  return walks.filter(walkQualifiesForTinkerExport).length;
}

export async function qualifyAllRealWalks(benches: Bench[]) {
  const model = exportModelLabel();
  let updated = 0;
  for (const walk of await readAllWalks()) {
    const bench = benches.find((item) => item.id === walk.benchId) ?? null;
    const patch = qualifyWalkPatch(walk, bench, model);
    if (!patch) continue;
    await updateWalk(walk.id, patch);
    updated += 1;
  }
  const exportable = await countExportableWalks();
  return { updated, exportable };
}
