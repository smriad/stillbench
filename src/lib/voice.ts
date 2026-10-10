import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordHealth } from "./health";
import { dataFile } from "./paths";
import { traced } from "./trace";

const audioDir = dataFile("audio");
const chimePath = path.join(audioDir, "chime.mp3");
const API = "https://api.elevenlabs.io/v1";

const CHIME_PROMPT =
  "a single soft wooden wind chime, two gentle notes, outdoors, quiet park, fading out slowly";

export function audioPath(walkId: string) {
  return path.join(audioDir, `${walkId}.mp3`);
}

function apiKey() {
  return process.env.ELEVENLABS_API_KEY || null;
}

export async function synthesizeBrief(walkId: string, text: string) {
  const key = apiKey();
  if (!key) return false;

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const response = await traced(
    "elevenlabs.text_to_speech",
    { "elevenlabs.characters": text.length },
    () =>
      fetch(`${API}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      }),
  );

  if (!response.ok) {
    console.error("ElevenLabs refused the brief.", response.status);
    await recordHealth("tts", false, `ElevenLabs answered ${response.status}`);
    return false;
  }

  await mkdir(audioDir, { recursive: true });
  await writeFile(audioPath(walkId), Buffer.from(await response.arrayBuffer()));
  await recordHealth("tts", true, "voiced the brief");
  return true;
}

export async function readBriefAudio(walkId: string) {
  try {
    return await readFile(audioPath(walkId));
  } catch {
    return null;
  }
}

let chimeRefused = false;

export async function chimeAudio() {
  try {
    return await readFile(chimePath);
  } catch {}

  const key = apiKey();
  if (!key || chimeRefused) return null;

  const response = await traced("elevenlabs.sound_generation", {}, () =>
    fetch(`${API}/sound-generation`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: CHIME_PROMPT,
        duration_seconds: 4,
        prompt_influence: 0.6,
      }),
    }),
  );

  if (!response.ok) {
    chimeRefused = response.status === 401 || response.status === 403;
    console.error("ElevenLabs did not make the chime.", response.status);
    await recordHealth(
      "chime",
      false,
      chimeRefused ? "the key lacks sound_generation" : `ElevenLabs answered ${response.status}`,
    );
    return null;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await mkdir(audioDir, { recursive: true });
  await writeFile(chimePath, audio);
  await recordHealth("chime", true, "generated the chime");
  return audio;
}

export async function transcribe(audio: Blob) {
  const key = apiKey();
  if (!key) return null;

  const form = new FormData();
  form.set("model_id", "scribe_v1");
  form.set("file", audio, "debrief.webm");

  const response = await traced(
    "elevenlabs.speech_to_text",
    { "elevenlabs.bytes": audio.size },
    () =>
      fetch(`${API}/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": key },
        body: form,
      }),
  );

  if (!response.ok) {
    console.error("ElevenLabs could not hear the debrief.", response.status);
    await recordHealth("stt", false, `ElevenLabs answered ${response.status}`);
    return null;
  }

  const payload = (await response.json()) as { text?: string };
  await recordHealth("stt", true, "transcribed a debrief");
  return payload.text?.trim() || null;
}
