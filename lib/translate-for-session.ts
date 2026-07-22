import { getPendingUpload } from "./pending-uploads";
import { getCachedResult, setCachedResult, getInFlight, setInFlight } from "./translation-cache";
import { translateDocument, SupportedFormat } from "./translate-document";

/**
 * Translate the document for a given checkout session exactly once,
 * regardless of how many callers ask for it concurrently (the webhook
 * firing at roughly the same time as the success page, for instance).
 *
 * - If a cached result already exists, return it immediately.
 * - If a translation is already in flight for this session, await that
 *   same promise instead of starting a second Gemini call.
 * - Otherwise, run the translation, cache the result, and return it.
 *
 * Crucially, this does NOT delete the pending input upload — the input
 * is now only cleaned up by its own TTL (lib/pending-uploads.ts), so
 * either caller can safely re-request the same session's result
 * without racing the other into deleting data out from under it.
 */
export async function translateForSession(sessionId: string) {
  const cached = getCachedResult(sessionId);
  if (cached) return cached;

  const existing = getInFlight(sessionId);
  if (existing) return existing;

  const pending = getPendingUpload(sessionId);
  if (!pending) {
    throw new Error("PENDING_FILE_NOT_FOUND");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const promise = (async () => {
    const result = await translateDocument(
      pending.buffer,
      pending.format as SupportedFormat,
      apiKey
    );

    // detectFormat() guarantees pending.filename always ends in
    // .docx/.pptx/.txt by the time it reaches here, so this regex
    // always has something to match — but fall back to appending
    // "-ar" outright if that assumption is ever violated, rather than
    // silently returning the exact same filename as the input (which
    // would otherwise happen if there's no extension to match against).
    const outputFilename = /\.[^.]+$/.test(pending.filename)
      ? pending.filename.replace(/(\.[^.]+)$/, "-ar$1")
      : `${pending.filename}-ar`;

    const entry = {
      outputBuffer: result.outputBuffer,
      outputFilename,
      segmentCount: result.segmentCount,
      wantsExpertReview: pending.wantsExpertReview,
    };

    setCachedResult(sessionId, entry);
    return entry;
  })();

  setInFlight(sessionId, promise);
  return promise;
}
