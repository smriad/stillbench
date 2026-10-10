import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { allBenches } from "@/lib/benches";
import { benchLeaderboard, playerLeaderboard } from "@/lib/leaderboard";
import { publicEchoes, realSits } from "@/lib/stats";
import { readAllWalks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Stillbench · Leaderboard",
};

export default async function LeaderboardPage() {
  await connection();
  const walks = await readAllWalks();
  const benches = await allBenches();
  const area = (benchId: string) =>
    benches.find((bench) => bench.id === benchId)?.area ?? "a bench";

  const benchRows = benchLeaderboard(walks, area);
  const playerRows = playerLeaderboard(walks);
  const echoes = publicEchoes(walks, area, 8);
  const totalSits = realSits(walks);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10">
      <header>
        <p className="text-sm tracking-[0.22em] text-moss uppercase">Stillbench</p>
        <h1 className="font-display mt-3 text-4xl leading-tight">Who sat where</h1>
        <p className="mt-2 text-ink/70">
          {totalSits} real sit{totalSits === 1 ? "" : "s"} logged on this instance.
          Add a nickname on your debrief to climb the streak board.
        </p>
      </header>

      {playerRows.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Streak board</h2>
          <ol className="mt-4 flex flex-col gap-2">
            {playerRows.map((row, index) => (
              <li
                key={row.nickname}
                className="border-ink/15 flex items-baseline justify-between gap-4 rounded-2xl border px-4 py-3"
              >
                <span className="text-ink/50 tabular-nums">{index + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium">{row.nickname}</span>
                <span className="shrink-0 text-right text-sm text-ink/70">
                  {row.streak} day streak · {row.sits} sit{row.sits === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="mt-10 text-sm text-ink/60">
          No nicknames yet. After a sit, add one on the debrief screen — honor system, no accounts.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Benches by sits</h2>
        {benchRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No completed walks yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {benchRows.map((row, index) => (
              <li
                key={row.benchId}
                className="border-ink/15 flex items-baseline justify-between gap-4 rounded-2xl border px-4 py-3"
              >
                <span className="text-ink/50 tabular-nums">{index + 1}.</span>
                <span className="min-w-0 flex-1">{row.area}</span>
                <span className="shrink-0 text-sm text-ink/70">
                  {row.sits} sat
                  {row.bails > 0 ? ` · ${row.bails} bailed` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {echoes.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Shared echoes</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink/80">
            {echoes.map((echo) => (
              <li key={`${echo.area}-${echo.day}-${echo.line}`}>
                <span className="text-ink/50">{echo.day}</span>
                {" · "}
                Near {echo.area}: &ldquo;{echo.line}&rdquo;
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link href="/" className="text-moss mt-10 inline-block underline-offset-4 hover:underline">
        Back to the bench
      </Link>
    </main>
  );
}
