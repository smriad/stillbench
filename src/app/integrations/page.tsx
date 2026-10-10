import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { checkIntegrations, type IntegrationState } from "@/lib/integrations";

export const metadata: Metadata = {
  title: "Stillbench · What is switched on",
};

const badge: Record<IntegrationState, { label: string; dot: string; text: string }> = {
  on: { label: "On", dot: "bg-moss", text: "text-moss" },
  set: { label: "Set, not proven", dot: "bg-amber-600", text: "text-amber-700" },
  off: { label: "Off", dot: "bg-ink/25", text: "text-ink/50" },
  error: { label: "Broken", dot: "bg-clay", text: "text-clay" },
};

export default async function IntegrationsPage() {
  await connection();
  const integrations = await checkIntegrations();
  const count = (state: IntegrationState) =>
    integrations.filter((item) => item.state === state).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.22em] text-moss uppercase">Stillbench</p>
          <h1 className="font-display mt-3 text-4xl leading-tight">What is switched on</h1>
          <p className="mt-2 text-ink/70">
            {count("on")} on · {count("set")} set but not proven · {count("error")} broken ·{" "}
            {count("off")} off
          </p>
        </div>
        <Link
          href="/integrations"
          prefetch={false}
          className="border-ink/30 shrink-0 rounded-full border px-4 py-2 text-sm"
        >
          Check again
        </Link>
      </header>

      <ul className="mt-8 flex flex-col gap-3">
        {integrations.map((item) => {
          const look = badge[item.state];
          return (
            <li key={item.name} className="border-ink/15 rounded-2xl border px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-semibold">{item.name}</h2>
                <span className={`flex shrink-0 items-center gap-2 text-sm ${look.text}`}>
                  <span className={`size-2.5 rounded-full ${look.dot}`} aria-hidden />
                  {look.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink/60">{item.role}</p>
              <p className="mt-2">{item.detail}</p>
              {item.fix ? (
                <p className="mt-1 text-sm text-ink/70">
                  Next: <code className="bg-ink/5 rounded px-1.5 py-0.5">{item.fix}</code>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-sm text-ink/60">
        &ldquo;On&rdquo; means it answered this page just now or worked on its last real call.
        &ldquo;Set, not proven&rdquo; means the key is there but nothing has used it yet. No
        keys are shown here.
      </p>
      <Link href="/" className="text-moss mt-6 inline-block underline-offset-4 hover:underline">
        Back to the bench
      </Link>
    </main>
  );
}
