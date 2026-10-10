import path from "node:path";

export const seedDir = path.join(process.cwd(), "data");

export const dataDir = process.env.STILLBENCH_DATA_DIR
  ? path.resolve(process.env.STILLBENCH_DATA_DIR)
  : seedDir;

export function dataFile(...parts: string[]) {
  return path.join(dataDir, ...parts);
}
