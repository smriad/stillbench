import * as Sentry from "@sentry/node";

type Attributes = Record<string, string | number | boolean>;

export function traced<T>(name: string, attributes: Attributes, run: () => Promise<T>) {
  if (!Sentry.getClient()) return run();
  return Sentry.startSpan({ name, op: name, attributes }, run);
}
