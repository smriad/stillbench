const SUNRISE_MINUTES = [
  6 * 60 + 40,
  6 * 60 + 28,
  6 * 60 + 4,
  5 * 60 + 32,
  5 * 60 + 12,
  5 * 60 + 8,
  5 * 60 + 18,
  5 * 60 + 32,
  5 * 60 + 42,
  5 * 60 + 52, // Oct
  6 * 60 + 8,
  6 * 60 + 28,
];

const SUNSET_MINUTES = [
  17 * 60 + 28, // Jan
  17 * 60 + 48,
  18 * 60 + 4,
  18 * 60 + 16,
  18 * 60 + 30,
  18 * 60 + 44,
  18 * 60 + 42,
  18 * 60 + 22,
  17 * 60 + 54,
  17 * 60 + 28, // Oct
  17 * 60 + 12,
  17 * 60 + 10, // Dec
];

export function dhakaClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    hour: read("hour"),
    minute: read("minute"),
    month: read("month"),
  };
}

export function lightMinutesLeft(now = new Date()) {
  const clock = dhakaClock(now);
  const sunset = SUNSET_MINUTES[clock.month - 1] ?? 17 * 60 + 30;
  const sunrise = SUNRISE_MINUTES[clock.month - 1] ?? 6 * 60;
  const current = clock.hour * 60 + clock.minute;
  if (current < sunrise) return current - sunrise;
  return sunset - current;
}
