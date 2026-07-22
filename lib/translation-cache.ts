import { TtlMap } from "./ttl-map";
import { registerForCleanup } from "./cleanup-timer";

export interface TranslationResult {
  outputBuffer: Buffer;
  outputFilename: string;
  segmentCount: number;
}

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
  promise.finally(() => inFlight.delete(sessionId));
}

export const RESULT_CACHE_TTL_MS = RESULT_TTL_MS;
