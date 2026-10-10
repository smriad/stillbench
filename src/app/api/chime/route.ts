import { chimeAudio } from "@/lib/voice";

export const dynamic = "force-dynamic";

export async function GET() {
  const audio = await chimeAudio();
  if (!audio) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=604800",
    },
  });
}
