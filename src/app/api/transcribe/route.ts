import { transcribe } from "@/lib/voice";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "No audio came through." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ error: "Keep it to a sentence." }, { status: 413 });
  }

  const text = await transcribe(audio);
  if (!text) {
    return Response.json({ error: "Could not hear that. Type it instead." }, { status: 502 });
  }
  return Response.json({ text: text.slice(0, 280) });
}
