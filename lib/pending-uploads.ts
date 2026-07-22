import { TtlMap } from "./ttl-map";
import { registerForCleanup } from "./cleanup-timer";

export interface PendingUpload {
  buffer: Buffer;
  filename: string;
  format: string;
  wordCount: number;
}

const TTL_MS = 30 * 60 * 1000;
const store = new TtlMap<PendingUpload>(TTL_MS);
registerForCleanup(store as TtlMap<unknown>);

export function putPendingUpload(
  sessionId: string,
  buffer: Buffer,
  filename: string,
  format: string,
  wordCount: number = 0
) {
  store.set(sessionId, { buffer, filename, format, wordCount });
}

export function getPendingUpload(sessionId: string): PendingUpload | null {
  return store.get(sessionId);
}

export function deletePendingUpload(sessionId: string) {
  store.delete(sessionId);
}
