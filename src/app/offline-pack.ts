const PACK_KEY = "stillbench-offline-pack";
const CACHE = "stillbench-v1";
const listeners = new Set<() => void>();

export function subscribeOfflinePack(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export type OfflinePack = {
  walkId: string;
  brief: string;
  benchName: string;
  benchArea: string;
  minutesAway: number;
  savedAt: string;
};

let cachedRaw: string | null | undefined;
let cachedPack: OfflinePack | null = null;

/** Stable snapshot for useSyncExternalStore (same reference until storage changes). */
export function getOfflinePackSnapshot(): OfflinePack | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (raw === cachedRaw) return cachedPack;
    cachedRaw = raw;
    cachedPack = raw ? (JSON.parse(raw) as OfflinePack) : null;
    return cachedPack;
  } catch {
    cachedRaw = null;
    cachedPack = null;
    return null;
  }
}

export function saveOfflinePack(pack: OfflinePack) {
  const raw = JSON.stringify(pack);
  localStorage.setItem(PACK_KEY, raw);
  cachedRaw = raw;
  cachedPack = pack;
  listeners.forEach((listener) => listener());
}

export function loadOfflinePack(): OfflinePack | null {
  return getOfflinePackSnapshot();
}

export async function cacheBriefAudio(walkId: string) {
  if (!("caches" in window)) return;
  const url = `/api/walks/${walkId}/audio`;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const cache = await caches.open(CACHE);
    await cache.put(url, response.clone());
  } catch {
    // offline cache is best-effort
  }
}

let activeBrief: HTMLAudioElement | null = null;

export function stopBriefPlayback() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeBrief) {
    activeBrief.pause();
    activeBrief.currentTime = 0;
    activeBrief = null;
  }
}

async function playElement(audio: HTMLAudioElement) {
  stopBriefPlayback();
  activeBrief = audio;
  audio.onended = () => {
    if (activeBrief === audio) activeBrief = null;
  };
  await audio.play();
}

/** ElevenLabs file if available; returns false so the caller can fall back to TTS. */
export async function playCachedBrief(walkId: string) {
  const url = `/api/walks/${walkId}/audio`;
  try {
    if ("caches" in window) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) {
        const blob = await hit.blob();
        await playElement(new Audio(URL.createObjectURL(blob)));
        return true;
      }
    }
    await playElement(new Audio(url));
    return true;
  } catch {
    return false;
  }
}
