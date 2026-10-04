import { MoodleError } from "./types.ts";

export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new MoodleError("origin", "Esta petición debe realizarse desde SMR HUB.", 403);
}

export async function readMoodleRequest(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body)
    throw new MoodleError("request", "La petición no es válida.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new MoodleError("request_size", "La petición es demasiado grande.", 413); }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch (error) {
    if (error instanceof MoodleError) throw error;
    throw new MoodleError("request", "La petición no es válida.");
  } finally { reader.releaseLock(); }
}
