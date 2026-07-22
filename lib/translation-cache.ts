/**
 * Result cache + in-flight dedup, so the webhook and the success page
 * (confirm-and-translate) can both attempt to translate the same
 * session without double-paying for Gemini calls or racing each other.
 *
 * - The TTL map holds the finished translation, keyed by session id,
 *   so whichever caller arrives second just gets the cached output.
 * - IN_FLIGHT holds the in-progress Promise for a session that's
 *   currently translating, so a caller that arrives *during*
 *   translation awaits the same promise instead of starting a second
 *   one. This one is a plain Map (not a TtlMap) since entries are only
 *   ever short-lived — they're removed the moment the promise settles.
 */
import { TtlMap } from "./ttl-map";
import { registerForCleanup } from "./cleanup-timer";

export interface TranslationResult {
  outputBuffer: Buffer;
  outputFilename: string;
  segmentCount: number;
  wantsExpertReview: boolean;
}

// Outlives the pending-upload TTL so a slow customer can still download
// after the webhook already translated it.
const RESULT_TTL_MS = 60 * 60 * 1000;

const resultStore = new TtlMap<TranslationResult>(RESULT_TTL_MS);
registerForCleanup(resultStore as TtlMap<unknown>);

const inFlight = new Map<string, Promise<TranslationResult>>();

export function getCachedResult(sessionId: string): TranslationResult | null {
  return resultStore.get(sessionId);
}

export function setCachedResult(sessionId: string, result: TranslationResult) {
  resultStore.set(sessionId, result);
}

export function getInFlight(sessionId: string): Promise<TranslationResult> | undefined {
  return inFlight.get(sessionId);
}

export function setInFlight(sessionId: string, promise: Promise<TranslationResult>) {
  inFlight.set(sessionId, promise);
  // Clear the in-flight marker once it settles, regardless of outcome,
  // so a failed attempt doesn't permanently block retries.
  promise.finally(() => inFlight.delete(sessionId));
}

// Exported for other modules that need the same lifetime (e.g.
// sent-email-markers.ts, which should expire alongside the result they
// guard) — kept as a named export rather than each file picking its
// own number that happens to match.
export const RESULT_CACHE_TTL_MS = RESULT_TTL_MS;
