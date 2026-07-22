import { getPendingUpload } from "./pending-uploads";
import { getCachedResult, setCachedResult, getInFlight, setInFlight } from "./translation-cache";
import { translateDocument, SupportedFormat } from "./translate-document";

export async function translateForSession(sessionId: string) {
  const cached = getCachedResult(sessionId);
  if (cached) return cached;

  const existing = getInFlight(sessionId);
  if (existing) return existing;

  const pending = getPendingUpload(sessionId);
  if (!pending) throw new Error("PENDING_FILE_NOT_FOUND");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const promise = (async () => {
    const result = await translateDocument(
      pending.buffer,
      pending.format as SupportedFormat,
      apiKey
    );

    const outputFilename = /\.[^.]+$/.test(pending.filename)
      ? pending.filename.replace(/(\.[^.]+)$/, "-ar$1")
      : `${pending.filename}-ar`;

    const entry = {
      outputBuffer: result.outputBuffer,
      outputFilename,
      segmentCount: result.segmentCount,
    };

    setCachedResult(sessionId, entry);
    return entry;
  })();

  setInFlight(sessionId, promise);
  return promise;
}
