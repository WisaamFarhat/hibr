/**
 * Marks that a given email has already been sent for a session, so a
 * Stripe webhook retry (which resends the same checkout.session.completed
 * event if the first attempt didn't respond within Stripe's own
 * timeout) doesn't send a second copy of the same email.
 * translation-cache.ts's result cache already prevents a second Gemini
 * call; this prevents a second email on top of that.
 */
import { TtlMap } from "./ttl-map";
import { registerForCleanup } from "./cleanup-timer";
import { RESULT_CACHE_TTL_MS } from "./translation-cache";

// Intentionally the same lifetime as the cached translation result
// these markers are guarding — imported, not re-typed as a literal, so
// the two can't silently drift apart.
const deliveryEmailSent = new TtlMap<true>(RESULT_CACHE_TTL_MS);
const reviewNotificationSent = new TtlMap<true>(RESULT_CACHE_TTL_MS);
registerForCleanup(deliveryEmailSent as TtlMap<unknown>);
registerForCleanup(reviewNotificationSent as TtlMap<unknown>);

export function hasDeliveryEmailBeenSent(sessionId: string): boolean {
  return deliveryEmailSent.has(sessionId);
}

export function markDeliveryEmailSent(sessionId: string) {
  deliveryEmailSent.set(sessionId, true);
}

export function hasReviewNotificationBeenSent(sessionId: string): boolean {
  return reviewNotificationSent.has(sessionId);
}

export function markReviewNotificationSent(sessionId: string) {
  reviewNotificationSent.set(sessionId, true);
}
