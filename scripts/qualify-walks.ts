import { allBenches } from "../src/lib/benches";
import { TINKER_EXPORT_MIN, qualifyAllRealWalks } from "../src/lib/walk-qualify";

async function main() {
  const { updated, exportable } = await qualifyAllRealWalks(await allBenches());
  console.log(`Updated ${updated} real sit(s). ${exportable} qualify for Tinker export (need ${TINKER_EXPORT_MIN}).`);
  if (exportable >= TINKER_EXPORT_MIN) {
    console.log("Run: npx tsx scripts/export-briefs.ts");
  } else {
    console.log(`Run: npm run seed:walks  (adds up to ${TINKER_EXPORT_MIN - exportable} more)`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
