import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import * as Sentry from "@sentry/node";
import { stillbenchAgent } from "./agents/stillbench-agent";
import { departWorkflow } from "./workflows/depart";

function sentryObservability() {
  if (!process.env.SENTRY_DSN) return undefined;
  // SentryExporter calls Sentry.init(), which hooks ChildProcess. Next.js
  // re-evaluates this module on every save, so a second init stacks listeners
  // until Node warns at 11.
  if (Sentry.getClient()) return undefined;
  return new Observability({
    configs: {
      sentry: {
        serviceName: "stillbench",
        exporters: [
          new SentryExporter({
            environment: process.env.NODE_ENV,
            tracesSampleRate: 1,
          }),
        ],
      },
    },
  });
}

const observability = sentryObservability();

export const mastra = new Mastra({
  agents: { stillbenchAgent },
  workflows: { departWorkflow },
  ...(observability ? { observability } : {}),
});
