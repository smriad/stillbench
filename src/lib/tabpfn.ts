import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttemptRow, LeaveQuery } from "./predict";

const API = "https://api.priorlabs.ai";
const cachePath = path.join(
  process.env.STILLBENCH_DATA_DIR ?? path.join(process.cwd(), "data"),
  "tabpfn.json",
);

type UploadInfo = {
  signed_urls: string[];
  required_headers?: Record<string, string>;
};

type TrainCache = {
  trainHash: string;
  fittedTrainSetId: string;
};

export function attemptsToCsv(rows: AttemptRow[], queries: LeaveQuery[]) {
  const header = "hour,minutes_away,light_minutes,last_bailed";
  const line = (row: LeaveQuery) =>
    [row.hour, row.minutesAway, row.lightMinutes, row.lastBailed ? 1 : 0].join(",");

  return {
    xTrain: [header, ...rows.map(line)].join("\n"),
    yTrain: ["left", ...rows.map((row) => (row.left ? "1" : "0"))].join("\n"),
    xTest: [header, ...queries.map(line)].join("\n"),
    trainHash: createHash("sha256")
      .update(rows.map((row) => `${line(row)},${row.left ? 1 : 0}`).join("\n"))
      .digest("hex"),
  };
}

export function tabpfnReady(rows: AttemptRow[]) {
  const labels = new Set(rows.map((row) => row.left));
  return rows.length >= 4 && labels.size >= 2;
}

export function readLeaveProbabilities(prediction: unknown, count: number): number[] {
  const unknownShape = new Error(
    "TabPFN returned a prediction shape Stillbench does not understand.",
  );

  if (prediction && typeof prediction === "object" && !Array.isArray(prediction)) {
    const record = prediction as Record<string, unknown>;
    const positive = record["1"] ?? record.left ?? record.true;
    const values = Array.isArray(positive) ? positive : [positive];
    if (values.length === count && values.every((value) => typeof value === "number")) {
      return values.map((value) => clamp(value as number));
    }
    throw unknownShape;
  }

  if (!Array.isArray(prediction)) throw unknownShape;

  if (prediction.every((value) => typeof value === "number")) {
    if (prediction.length === count) return prediction.map((value) => clamp(value));
    if (count === 1 && prediction.length === 2) return [clamp(prediction[1])];
    throw unknownShape;
  }

  if (
    prediction.length === 1 &&
    count > 1 &&
    Array.isArray(prediction[0]) &&
    Array.isArray(prediction[0][0])
  ) {
    return readLeaveProbabilities(prediction[0], count);
  }

  if (prediction.length === count) {
    return prediction.map((row) => {
      if (Array.isArray(row) && row.length === 1 && Array.isArray(row[0])) row = row[0];
      if (typeof row === "number") return clamp(row);
      if (Array.isArray(row) && row.length >= 2 && typeof row[1] === "number") {
        return clamp(row[1]);
      }
      throw unknownShape;
    });
  }

  throw unknownShape;
}

function clamp(value: number) {
  return Math.min(0.92, Math.max(0.08, value));
}

async function readCache(trainHash: string) {
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8")) as TrainCache;
    return cache.trainHash === trainHash ? cache.fittedTrainSetId : null;
  } catch {
    return null;
  }
}

async function writeCache(cache: TrainCache) {
  await writeFile(cachePath, JSON.stringify(cache));
}

async function postJson(apiKey: string, route: string, body: unknown) {
  const response = await fetch(`${API}${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const start = ["{", "["]
    .map((mark) => text.indexOf(mark))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const json =
    start === undefined ? {} : (JSON.parse(text.slice(start)) as Record<string, unknown>);
  if (!response.ok) {
    throw new Error(`TabPFN ${route} failed (${response.status}).`);
  }
  return json;
}

async function putCsv(info: UploadInfo, csv: string) {
  const headers = new Headers(info.required_headers ?? {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/csv");
  const response = await fetch(info.signed_urls[0], {
    method: "PUT",
    headers,
    body: csv,
  });
  if (!response.ok) throw new Error(`TabPFN upload failed (${response.status}).`);
}

export async function tabpfnLeaveProbabilities(
  apiKey: string,
  rows: AttemptRow[],
  queries: LeaveQuery[],
) {
  const tables = attemptsToCsv(rows, queries);
  let fittedTrainSetId = await readCache(tables.trainHash);

  if (!fittedTrainSetId) {
    const prepared = await postJson(apiKey, "/tabpfn/prepare_train_set_upload", {
      x_train_info: { format: "csv" },
      y_train_info: { format: "csv" },
    });
    await putCsv(prepared.x_train_info as UploadInfo, tables.xTrain);
    await putCsv(prepared.y_train_info as UploadInfo, tables.yTrain);
    const fitted = await postJson(apiKey, "/tabpfn/fit", {
      train_set_upload_id: prepared.train_set_upload_id,
      task: "classification",
      tabpfn_config: { model_path: "v3.5_default" },
    });
    fittedTrainSetId = String(fitted.fitted_train_set_id);
    await writeCache({ trainHash: tables.trainHash, fittedTrainSetId });
  }

  const preparedTest = await postJson(apiKey, "/tabpfn/prepare_test_set_upload", {
    fitted_train_set_id: fittedTrainSetId,
    x_test_info: { format: "csv" },
  });
  await putCsv(preparedTest.x_test_info as UploadInfo, tables.xTest);
  const result = await postJson(apiKey, "/tabpfn/predict", {
    test_set_upload_id: preparedTest.test_set_upload_id,
    fitted_train_set_id: fittedTrainSetId,
    task_config: {
      task: "classification",
      predict_params: { output_type: "probas" },
    },
  });

  return readLeaveProbabilities(result.prediction, queries.length);
}
