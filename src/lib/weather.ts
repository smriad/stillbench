export type WeatherHint = {
  summary: string;
  tempC: number;
};

function homeCoords() {
  const raw = process.env.STILLBENCH_HOME?.split(",").map((part) => Number(part.trim()));
  if (!raw || raw.length !== 2 || raw.some(Number.isNaN)) return null;
  return { lat: raw[0], lng: raw[1] };
}

export async function weatherHint(): Promise<WeatherHint | null> {
  const home = homeCoords();
  if (!home) return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(home.lat),
    longitude: String(home.lng),
    current: "temperature_2m,weather_code",
    timezone: "Asia/Dhaka",
  }).toString();

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const tempC = payload.current?.temperature_2m;
    const code = payload.current?.weather_code;
    if (tempC === undefined || code === undefined) return null;
    const summary = describeWmo(code);
    return { summary, tempC: Math.round(tempC) };
  } catch {
    return null;
  }
}

function describeWmo(code: number) {
  if (code === 0) return "clear sky";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow showers";
  if (code <= 99) return "thunderstorms";
  return "unsettled";
}
