"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  cacheBriefAudio,
  getOfflinePackSnapshot,
  playCachedBrief,
  saveOfflinePack,
  stopBriefPlayback,
  subscribeOfflinePack,
} from "./offline-pack";
import { armChime, cancelChime, chimeArmed } from "./chime";
import { afterSitLine, checkInText, type SitNeed } from "@/lib/need";
import {
  BENCH_STEP,
  HOME_HOW,
  HOME_PURPOSE,
  HOME_PURPOSE_BAILED,
  homeHeadline,
} from "@/lib/home-copy";
import { DEDICATION_MAX, noticePrompt, sanitizeDedication } from "@/lib/meaning";
import { formatSitStory } from "@/lib/sit-story";

type Bench = {
  id: string;
  name: string;
  area: string;
  minutesAway: number;
  note: string;
};

type Walk = {
  id: string;
  status: "briefed" | "left" | "sitting" | "sat" | "bailed";
  brief: string;
  model: string;
  leaveProbability: number;
  predictionSource: "baseline" | "tabpfn";
  practice: boolean;
  sitSeconds: number;
  lightMinutes: number;
  lastBailed?: boolean;
  sittingStartedAt?: string;
  debrief?: string;
  durable?: boolean;
  weatherSummary?: string;
  outsideConfirmed?: boolean;
  shareDebrief?: boolean;
  need?: SitNeed;
  companionLine?: string;
  dedication?: string;
  benchReason?: string;
};

type DepartResponse = {
  walk: Walk;
  bench: Bench;
  spoken: boolean;
};

const STORAGE_KEY = "stillbench-walk";
const NICKNAME_KEY = "stillbench-nickname";
const DEDICATION_KEY = "stillbench-dedication";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  stopBriefPlayback();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

async function playBrief(walkId: string, text: string, useVoiceFile: boolean) {
  if (useVoiceFile) {
    const played = await playCachedBrief(walkId);
    if (played) return;
  }
  speak(text);
}

const MAX_NOTE_MS = 15_000;
const noSubscription = () => () => {};

function VoiceNote({ onText }: { onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "listening" | "hearing">("idle");
  const [problem, setProblem] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const supported = useSyncExternalStore(
    noSubscription,
    () =>
      typeof window.MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );

  if (!supported) return null;

  async function begin() {
    setProblem("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setState("hearing");
        const form = new FormData();
        form.set("audio", new Blob(chunks, { type: media.mimeType }));
        const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const payload = (await response.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
        };
        if (payload.text) onText(payload.text);
        else setProblem(payload.error ?? "Could not hear that. Type it instead.");
        setState("idle");
      };
      recorder.current = media;
      media.start();
      setState("listening");
      window.setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, MAX_NOTE_MS);
    } catch {
      setProblem("The microphone is off. Type it instead.");
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        className="border-ink/30 min-h-14 rounded-full border px-6 text-lg disabled:opacity-60"
        disabled={state === "hearing"}
        onClick={() =>
          state === "listening" ? recorder.current?.stop() : void begin()
        }
      >
        {state === "listening"
          ? "Stop, that's it"
          : state === "hearing"
            ? "Listening back…"
            : "Say it instead"}
      </button>
      {problem ? <p className="text-clay text-sm">{problem}</p> : null}
    </>
  );
}

function CheckIn({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "sent" | "copied" | "shown">("idle");

  async function share() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        setState("sent");
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("shown");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="text-moss min-h-12 text-base" onClick={() => void share()}>
        {state === "sent"
          ? "They have the note"
          : state === "copied"
            ? "Copied. Paste it to someone you trust"
            : state === "shown"
              ? "Send this note"
              : label}
      </button>
      {state === "shown" ? <p className="text-sm text-ink/70">{text}</p> : null}
    </div>
  );
}

function CopySitStory({
  walk,
  bench,
  debrief,
}: {
  walk: Walk;
  bench: Bench;
  debrief: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "shown">("idle");
  const text = formatSitStory({
    benchName: bench.name,
    benchArea: bench.area,
    minutesAway: bench.minutesAway,
    sitMinutes: Math.round(walk.sitSeconds / 60),
    need: walk.need,
    dedication: walk.dedication,
    debrief,
    benchReason: walk.benchReason,
    model: walk.model,
    predictionSource: walk.predictionSource,
    practice: walk.practice,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("shown");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="border-ink/30 min-h-12 rounded-full border px-5 text-base"
        onClick={() => void copy()}
      >
        {state === "copied" ? "Copied for your DEV post" : "Copy sit story (markdown)"}
      </button>
      {state === "shown" ? (
        <pre className="border-ink/15 max-h-40 overflow-auto rounded-2xl border p-3 text-xs whitespace-pre-wrap">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

export function WalkApp() {
  const [walk, setWalk] = useState<Walk | null>(null);
  const [bench, setBench] = useState<Bench | null>(null);
  const [spoken, setSpoken] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingNeed, setPendingNeed] = useState<SitNeed | "practice" | "">("");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState("");
  const [debrief, setDebrief] = useState("");
  const [shareEcho, setShareEcho] = useState(false);
  const [outsideYes, setOutsideYes] = useState(false);
  const [nickname, setNickname] = useState("");
  const [streak, setStreak] = useState(0);
  const [minutesThisWeek, setMinutesThisWeek] = useState(0);
  const [lastBailed, setLastBailed] = useState(false);
  const [lastSit, setLastSit] = useState("");
  const [dedication, setDedication] = useState("");
  const [echoes, setEchoes] = useState<{ area: string; line: string }[]>([]);
  const offlinePack = useSyncExternalStore(
    subscribeOfflinePack,
    getOfflinePackSnapshot,
    () => null,
  );
  const finishing = useRef(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            streak?: number;
            minutesThisWeek?: number;
            lastBailed?: boolean;
            lastSit?: string;
            echoes?: { area: string; line: string }[];
          } | null,
        ) => {
          if (!payload) return;
          setStreak(payload.streak ?? 0);
          setMinutesThisWeek(payload.minutesThisWeek ?? 0);
          setLastBailed(Boolean(payload.lastBailed));
          setLastSit(payload.lastSit ?? "");
          setEchoes(payload.echoes ?? []);
        },
      )
      .catch(() => undefined);
  }, [walk]);

  useEffect(() => {
    const savedNick = localStorage.getItem(NICKNAME_KEY);
    if (savedNick) setNickname(savedNick);
    const savedFor = localStorage.getItem(DEDICATION_KEY);
    if (savedFor) setDedication(savedFor);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const id = saved;
    fetch(`/api/walks/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { walk: Walk; bench: Bench } | null) => {
        if (!payload) return;
        if (payload.walk.status === "sat" || payload.walk.status === "bailed") {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        setWalk(payload.walk);
        setBench(payload.bench);
        setSpoken(false);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.body.dataset.mode = walk?.status === "sitting" ? "sit" : "door";
    return () => {
      delete document.body.dataset.mode;
    };
  }, [walk?.status]);

  useEffect(() => {
    if (walk?.status !== "sitting" || !walk.sittingStartedAt) return;
    finishing.current = false;
    const ends =
      new Date(walk.sittingStartedAt).getTime() + walk.sitSeconds * 1000;

    const tick = () => {
      const left = ends - Date.now();
      setRemaining(formatRemaining(left));
      if (left <= 0 && !finishing.current) {
        finishing.current = true;
        if (!chimeArmed()) void armChime(0);
        void move("sat");
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [walk?.status, walk?.sittingStartedAt, walk?.sitSeconds, walk?.id]);

  async function start(practice: boolean, need: SitNeed = "outside") {
    setPending(true);
    setPendingNeed(practice ? "practice" : need);
    setError("");
    if ("speechSynthesis" in window) {
      const unlock = new SpeechSynthesisUtterance(" ");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }

    try {
      const response = await fetch("/api/depart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practice,
          need,
          dedication: sanitizeDedication(dedication),
        }),
      });
      if (!response.ok) throw new Error("The brief did not come back.");
      const payload = (await response.json()) as DepartResponse;
      const named = sanitizeDedication(dedication);
      if (named) localStorage.setItem(DEDICATION_KEY, named);
      else localStorage.removeItem(DEDICATION_KEY);
      localStorage.setItem(STORAGE_KEY, payload.walk.id);
      setWalk(payload.walk);
      setBench(payload.bench);
      setSpoken(payload.spoken);
      const pack = {
        walkId: payload.walk.id,
        brief: payload.walk.brief,
        benchName: payload.bench.name,
        benchArea: payload.bench.area,
        minutesAway: payload.bench.minutesAway,
        savedAt: new Date().toISOString(),
      };
      saveOfflinePack(pack);
      void cacheBriefAudio(payload.walk.id);
      await playBrief(payload.walk.id, payload.walk.brief, payload.spoken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something broke.");
    } finally {
      setPending(false);
      setPendingNeed("");
    }
  }

  async function move(
    action: "left" | "sitting" | "sat" | "bailed",
    note?: string,
  ) {
    if (!walk) return;
    setError("");
    if (action === "sitting") void armChime(walk.sitSeconds);
    if (action === "bailed") cancelChime();
    const response = await fetch(`/api/walks/${walk.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, debrief: note }),
    });
    const payload = (await response.json()) as {
      walk?: Walk;
      bench?: Bench;
      error?: string;
    };
    if (response.status === 409) {
      const current = await fetch(`/api/walks/${walk.id}`).then((res) =>
        res.ok ? (res.json() as Promise<{ walk: Walk }>) : null,
      );
      if (current && current.walk.status !== walk.status) {
        setWalk(current.walk);
        return;
      }
    }
    if (!response.ok || !payload.walk) {
      if (action === "sitting") cancelChime();
      setError(payload.error ?? "That step did not save.");
      return;
    }
    setWalk(payload.walk);
    if (payload.bench) setBench(payload.bench);
    if (payload.walk.status === "sat" || payload.walk.status === "bailed") {
      localStorage.removeItem(STORAGE_KEY);
      stopBriefPlayback();
    }
  }

  if (!walk || !bench || walk.status === "bailed") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-8">
        <header>
          <p className="text-sm tracking-[0.22em] text-moss uppercase">Stillbench</p>
          <h1 className="font-display mt-6 text-5xl leading-[0.95] text-balance">
            {homeHeadline(Boolean(lastBailed || walk?.status === "bailed"))}
          </h1>
          <p className="mt-4 max-w-sm text-lg leading-snug text-ink/80">
            {lastBailed || walk?.status === "bailed" ? HOME_PURPOSE_BAILED : HOME_PURPOSE}
          </p>
          {lastSit && !lastBailed && walk?.status !== "bailed" ? (
            <p className="mt-3 text-base leading-snug text-ink/70">{lastSit}</p>
          ) : null}
          {!lastBailed && walk?.status !== "bailed" ? (
            <p className="mt-3 text-sm text-ink/60">{HOME_HOW}</p>
          ) : null}
          {streak > 0 && !lastSit ? (
            <p className="mt-4 text-sm text-moss">
              {streak} day{streak === 1 ? "" : "s"} in a row you sat outside.
            </p>
          ) : streak > 1 ? (
            <p className="mt-4 text-sm text-moss">
              {streak} days in a row.
            </p>
          ) : null}
          {echoes.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-ink/70">
              {echoes.slice(0, 2).map((echo) => (
                <li key={`${echo.area}-${echo.line}`}>
                  Someone sat near {echo.area} and noticed &ldquo;{echo.line}&rdquo;
                </li>
              ))}
            </ul>
          ) : null}
        </header>
        <div className="flex flex-col gap-3">
          {error ? <p className="text-clay">{error}</p> : null}
          {offlinePack ? (
            <button
              type="button"
              className="border-ink/20 min-h-12 rounded-full border px-5 text-base"
              onClick={() => void playBrief(offlinePack.walkId, offlinePack.brief, true)}
            >
              {typeof navigator !== "undefined" && !navigator.onLine
                ? "Listen to the saved brief"
                : "Replay last brief on this phone"}
            </button>
          ) : null}
          {walk?.status === "bailed" ? (
            <p className="text-ink/70">
              Staying in is a data point. If the street was too much, start with the roof.
            </p>
          ) : null}
          <label className="text-sm text-ink/70">
            This sit is for
            <input
              className="border-ink/20 bg-paper mt-2 min-h-12 w-full rounded-2xl border px-4 text-base text-ink"
              value={dedication}
              onChange={(event) => setDedication(event.target.value)}
              placeholder="a person, a day, or leave it blank"
              maxLength={DEDICATION_MAX}
              disabled={pending}
              aria-label="This sit is for"
            />
          </label>
          <button
            className={
              lastBailed || walk?.status === "bailed"
                ? "border-ink/30 min-h-14 rounded-full border px-6 text-lg disabled:opacity-60"
                : "bg-ink text-paper min-h-16 rounded-full px-6 text-xl disabled:opacity-60"
            }
            disabled={pending}
            onClick={() => void start(false, "outside")}
          >
            {pendingNeed === "outside" ? "Writing the brief…" : "Take me outside"}
          </button>
          <button
            className={
              lastBailed || walk?.status === "bailed"
                ? "bg-ink text-paper min-h-16 rounded-full px-6 text-xl disabled:opacity-60"
                : "border-ink/30 min-h-14 rounded-full border px-6 text-lg disabled:opacity-60"
            }
            disabled={pending}
            onClick={() => void start(false, "doorstep")}
          >
            {pendingNeed === "doorstep" ? "Writing the brief…" : "The street is too much"}
          </button>
          <button
            className="border-ink/30 min-h-14 rounded-full border px-6 text-lg disabled:opacity-60"
            disabled={pending}
            onClick={() => void start(false, "together")}
          >
            {pendingNeed === "together" ? "Writing the brief…" : "Sit with someone"}
          </button>
          <button
            className="text-moss min-h-12 text-base underline-offset-4 hover:underline disabled:opacity-60"
            disabled={pending}
            onClick={() => void start(true)}
          >
            {pendingNeed === "practice" ? "Writing the brief…" : "Practice sit, twenty seconds"}
          </button>
        </div>
      </main>
    );
  }

  if (walk.status === "briefed" || walk.status === "left") {
    const echoHere = echoes.find((echo) => echo.area === bench.area);
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-8">
        <header>
          <p className="text-sm tracking-[0.22em] text-moss uppercase">
            {walk.status === "left" ? "On the way" : "Your bench"}
          </p>
          <h1 className="font-display mt-4 text-5xl leading-[0.95] text-balance">
            {bench.name}
          </h1>
          <p className="mt-3 text-lg">
            {bench.area}, {bench.minutesAway} minutes away
          </p>
          <p className="mt-3 text-sm leading-snug text-ink/65">{BENCH_STEP}</p>
          {walk.benchReason ? (
            <p className="mt-3 text-base leading-snug text-moss">{walk.benchReason}</p>
          ) : null}
          {echoHere ? (
            <p className="mt-3 text-sm text-ink/70">
              Last time someone sat near here they noticed &ldquo;{echoHere.line}&rdquo;
            </p>
          ) : null}
          <p className="mt-6 text-xl leading-snug">{walk.brief}</p>
          {walk.companionLine ? (
            <p className="mt-4 text-lg leading-snug text-ink/80">{walk.companionLine}</p>
          ) : null}
          {walk.dedication ? (
            <p className="mt-3 text-sm text-moss">This sit is for {walk.dedication}.</p>
          ) : null}
          <p className="mt-3 text-sm text-ink/70">{bench.note}</p>
          {walk.weatherSummary ? (
            <p className="mt-3 text-sm text-ink/60">Outside now: {walk.weatherSummary}</p>
          ) : null}
          <details className="mt-4 text-sm text-ink/55">
            <summary className="cursor-pointer text-ink/60">How this bench was chosen</summary>
            <p className="mt-2 leading-snug">
              {walk.predictionSource === "tabpfn"
                ? "TabPFN scored each nearby bench from your past walks (hour, distance, light, last bail)."
                : "A simple model from your past walks scored each nearby bench."}
              {" "}
              {Math.round(walk.leaveProbability * 100)}% leave chance for this one.
              {" "}
              Brief: {walk.model}
              {spoken ? ", spoken file cached on this phone." : ", this phone reads it."}
            </p>
          </details>
        </header>
        <div className="flex flex-col gap-3">
          {error ? <p className="text-clay">{error}</p> : null}
          {walk.status === "briefed" ? (
            <button
              className="bg-ink text-paper min-h-16 rounded-full px-6 text-xl"
              onClick={() => void move("left")}
            >
              I&apos;m leaving
            </button>
          ) : (
            <button
              className="bg-ink text-paper min-h-16 rounded-full px-6 text-xl"
              onClick={() => void move("sitting")}
            >
              I&apos;m sitting
            </button>
          )}
            <button
              className="text-moss min-h-12"
              onClick={() => void move("bailed")}
            >
              Not today
            </button>
          {walk.companionLine ? (
            <button
              type="button"
              className="text-moss min-h-12 text-base"
              onClick={() => speak(walk.companionLine ?? "")}
            >
              Play the line for them
            </button>
          ) : null}
          {walk.status === "briefed" || walk.status === "left" ? (
            <CheckIn
              text={checkInText(
                bench,
                walk.sitSeconds,
                new Date(),
                walk.status === "briefed" ? bench.minutesAway : 0,
                walk.dedication,
              )}
              label="Tell someone you're out"
            />
          ) : null}
        </div>
      </main>
    );
  }

  if (walk.status === "sitting") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="text-sm tracking-[0.22em] uppercase">Stay</p>
        <p className="font-display mt-4 text-8xl tabular-nums" aria-live="polite">
          {remaining || formatRemaining(walk.sitSeconds * 1000)}
        </p>
        <p className="mt-6 max-w-xs text-sm opacity-70">
          Pocket it. A chime will tell you when it&apos;s done
          {walk.durable ? ", and the server is keeping time if the phone sleeps." : "."}
          {walk.need === "doorstep" ? " Six minutes is enough." : ""}
        </p>
        <button
          className="mt-16 text-sm opacity-70"
          onClick={() => void move("bailed")}
        >
          End the sit
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-8">
      <header>
        <p className="text-sm tracking-[0.22em] text-moss uppercase">You sat</p>
        <h1 className="font-display mt-4 text-5xl leading-[0.95]">
          {afterSitLine({
            need: walk.need ?? "outside",
            practice: walk.practice,
            lastBailed: walk.lastBailed ?? false,
            streak,
            minutesThisWeek,
            dedication: walk.dedication,
            area: bench.area,
          })}
        </h1>
        <p className="mt-6 text-xl leading-snug">{noticePrompt(walk.need)}</p>
        {!walk.practice ? (
          <label className="mt-4 flex items-start gap-3 text-left text-sm text-ink/80">
            <input
              type="checkbox"
              className="mt-1"
              checked={outsideYes}
              onChange={(event) => setOutsideYes(event.target.checked)}
            />
            I was at the bench, not just the timer
            {walk.need === "doorstep" ? " — the roof counts." : "."}
          </label>
        ) : null}
      </header>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const note = debrief.trim();
          const nick = nickname.trim().slice(0, 24);
          if (nick) localStorage.setItem(NICKNAME_KEY, nick);
          void fetch(`/api/walks/${walk.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              debrief: note || undefined,
              outsideConfirmed: !walk.practice && outsideYes,
              shareDebrief: shareEcho && Boolean(note),
              nickname: nick || undefined,
            }),
          });
          localStorage.removeItem(STORAGE_KEY);
          setDebrief("");
          setShareEcho(false);
          setOutsideYes(false);
          setWalk(null);
          setBench(null);
        }}
      >
        <input
          className="border-ink/20 bg-paper min-h-14 rounded-2xl border px-4 text-lg"
          value={debrief}
          onChange={(event) => setDebrief(event.target.value)}
          placeholder="One line is enough"
          maxLength={280}
          aria-label={noticePrompt(walk.need)}
        />
        <VoiceNote onText={setDebrief} />
        <input
          className="border-ink/20 bg-paper min-h-12 rounded-2xl border px-4 text-base"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Nickname for the leaderboard (optional)"
          maxLength={24}
          aria-label="Leaderboard nickname"
        />
        {debrief.trim() ? (
          <label className="flex items-start gap-3 text-left text-sm text-ink/70">
            <input
              type="checkbox"
              className="mt-1"
              checked={shareEcho}
              onChange={(event) => setShareEcho(event.target.checked)}
            />
            Let the next person who sits hear this, without your name.
          </label>
        ) : null}
        <CopySitStory walk={walk} bench={bench} debrief={debrief} />
        <button className="bg-ink text-paper min-h-16 rounded-full px-6 text-xl" type="submit">
          Done
        </button>
      </form>
    </main>
  );
}
