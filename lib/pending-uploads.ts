/**
 * Temporary storage for uploaded files between "Stripe Checkout created"
 * and "payment confirmed webhook fires." Pay-per-document with no
 * accounts means we need *somewhere* to hold the file during that gap.
 */
import { TtlMap } from "./ttl-map";
import { registerForCleanup } from "./cleanup-timer";

export interface PendingUpload {
  buffer: Buffer;
  filename: string;
  format: string;
  wantsExpertReview: boolean;
  wordCount: number;
  reviewFeeUsd: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes — generous for a checkout flow
const store = new TtlMap<PendingUpload>(TTL_MS);
registerForCleanup(store as TtlMap<unknown>);

export function putPendingUpload(
  sessionId: string,
  buffer: Buffer,
  filename: string,
  format: string,
  wantsExpertReview: boolean = false,
  wordCount: number = 0,
  reviewFeeUsd: number = 0
) {
  store.set(sessionId, { buffer, filename, format, wantsExpertReview, wordCount, reviewFeeUsd });
}

export function getPendingUpload(sessionId: string): PendingUpload | null {
  return store.get(sessionId);
}

export function deletePendingUpload(sessionId: string) {
  store.delete(sessionId);
}
