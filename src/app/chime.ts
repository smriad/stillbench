type Armed = { context: AudioContext; source: AudioBufferSourceNode };

let armed: Armed | null = null;
let cached: Promise<ArrayBuffer | null> | null = null;

function fetchChime() {
  cached ??= fetch("/api/chime")
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  return cached;
}

function bell(context: BaseAudioContext) {
  const seconds = 3.5;
  const buffer = context.createBuffer(1, Math.ceil(seconds * context.sampleRate), context.sampleRate);
  const data = buffer.getChannelData(0);
  const notes = [
    { at: 0, hz: 1046.5 },
    { at: 0.45, hz: 784 },
  ];
  for (let i = 0; i < data.length; i += 1) {
    const t = i / context.sampleRate;
    let sample = 0;
    for (const note of notes) {
      if (t < note.at) continue;
      const local = t - note.at;
      const envelope = Math.exp(-local * 2.2) * Math.min(1, local * 80);
      sample +=
        envelope *
        (Math.sin(2 * Math.PI * note.hz * local) * 0.6 +
          Math.sin(2 * Math.PI * note.hz * 2.76 * local) * 0.15);
    }
    data[i] = sample * 0.4;
  }
  return buffer;
}

export async function armChime(secondsFromNow: number) {
  cancelChime();
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  await context.resume();
  const encoded = await fetchChime();
  let buffer: AudioBuffer;
  try {
    buffer = encoded ? await context.decodeAudioData(encoded.slice(0)) : bell(context);
  } catch {
    buffer = bell(context);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(context.currentTime + Math.max(0, secondsFromNow));
  source.onended = () => void context.close();
  armed = { context, source };
}

export function cancelChime() {
  if (!armed) return;
  try {
    armed.source.stop();
  } catch {}
  void armed.context.close().catch(() => undefined);
  armed = null;
}

export function chimeArmed() {
  return armed !== null;
}
