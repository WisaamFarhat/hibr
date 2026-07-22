import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getPendingUpload } from "@/lib/pending-uploads";
import {
  hasDeliveryEmailBeenSent,
  markDeliveryEmailSent,
  hasReviewNotificationBeenSent,
  markReviewNotificationSent,
} from "@/lib/sent-email-markers";
import { translateForSession } from "@/lib/translate-for-session";
import { sendExpertReviewNotification, sendOrderDeliveryEmail } from "@/lib/notify";
import type Stripe from "stripe";

// Translation can take a while for larger documents (many sequential
// Gemini batch calls) — give this route the same budget as
// confirm-and-translate rather than letting Stripe's webhook timeout
// (10s) cut it off mid-translation. Next.js requires this to be a
// literal, so it can't import FUNCTION_MAX_DURATION_SECONDS from
// lib/pricing-shared.ts directly — if you change this value, update
// that constant too (MAX_SEGMENT_COUNT's size ceiling is derived from it).
export const maxDuration = 300;

/**
 * Stripe webhook endpoint. Configure this URL in the Stripe Dashboard
 * (Developers → Webhooks) pointed at `${your domain}/api/webhook`,
 * subscribed to the `checkout.session.completed` event, and copy the
 * signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * Why this exists alongside the success-page polling in
 * confirm-and-translate: that route only fires if the customer's
 * browser actually loads the success page. If they close the tab
 * right after paying, or the redirect fails, nothing would otherwise
 * run the translation or get you a copy of the result. This webhook is
 * the reliable side-channel — it translates and emails you a copy of
 * EVERY paid order, regardless of what the customer's browser does.
 *
 * Translation itself is delegated to translateForSession (shared with
 * confirm-and-translate), which caches results per session id so the
 * webhook and the success page never pay for the same Gemini call
 * twice even if they fire close together.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("Webhook called without signature or STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Stripe requires the raw, unparsed request body to verify the
  // signature — reading it as text (not .json()) is required here.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    try {
      const pending = getPendingUpload(session.id);
      const customerEmail = session.customer_details?.email ?? null;

      if (pending?.wantsExpertReview && !hasReviewNotificationBeenSent(session.id)) {
        // Fire this first and independently — even if translation below
        // fails for some reason, you still want to know a review order
        // came in so you can chase it down manually.
        const sent = await sendExpertReviewNotification({
          filename: pending.filename,
          wordCount: pending.wordCount,
          reviewFeeUsd: pending.reviewFeeUsd,
          customerEmail,
          sessionId: session.id,
        });
        if (sent) markReviewNotificationSent(session.id);
      }

      // Translate (or reuse the cached result if confirm-and-translate
      // already did this — see translateForSession) and email a copy of
      // every completed order, not just expert-review ones. Guarded so a
      // Stripe webhook retry (which can legitimately happen if the first
      // attempt didn't respond before Stripe's own timeout) doesn't send
      // a second copy of the same email.
      const result = await translateForSession(session.id);

      if (!hasDeliveryEmailBeenSent(session.id)) {
        const sent = await sendOrderDeliveryEmail({
          outputFilename: result.outputFilename,
          outputBuffer: result.outputBuffer,
          segmentCount: result.segmentCount,
          wantsExpertReview: result.wantsExpertReview,
          customerEmail,
          sessionId: session.id,
          amountTotalUsd: (session.amount_total ?? 0) / 100,
        });
        if (sent) markDeliveryEmailSent(session.id);
      }
    } catch (err: any) {
      // Don't fail the webhook response over a translation/notification
      // error — Stripe will retry the webhook on non-2xx responses, and
      // the payment itself already succeeded regardless of whether we
      // managed to translate or notify. Log loudly so it's not silently
      // lost; if this keeps failing, the pending file's TTL eventually
      // expires and the order becomes unrecoverable, so don't ignore
      // repeated errors here in production.
      console.error("Webhook translation/notification failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}
