import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { exportBriefs } from "./export-briefs";

const root = process.cwd();
const venvPython = path.join(root, ".venv/bin/python");

function runPython(args: string[]) {
  const result = spawnSync(venvPython, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  if (!existsSync(venvPython)) {
    console.log("Creating .venv for Tinker training…");
    const venv = spawnSync("python3", ["-m", "venv", ".venv"], {
      cwd: root,
      stdio: "inherit",
    });
    if (venv.status !== 0) process.exit(venv.status ?? 1);
  }

  runPython(["-m", "pip", "install", "-q", "tinker", "transformers", "jinja2"]);

  console.log("Exporting briefs…");
  const { count, out } = await exportBriefs();
  console.log(`Wrote ${count} briefs that got you to sit to ${out}`);

  console.log("Training on Tinker…");
  runPython(["tinker/train_briefs.py"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
