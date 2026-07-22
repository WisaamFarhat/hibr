import { Resend } from "resend";

/**
 * Lazy Resend client, same pattern as lib/stripe.ts — avoids throwing
 * at module-load time (which would break `next build`) when the key
 * isn't set yet, e.g. before .env.local is configured or during CI.
 */
let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }

  _resend = new Resend(key);
  return _resend;
}

export interface ExpertReviewNotification {
  filename: string;
  wordCount: number;
  reviewFeeUsd: number;
  customerEmail: string | null;
  sessionId: string;
}

/**
 * Notify the operator (you) by email that someone has paid for expert
 * human review. This is intentionally a notification, not a delivery
 * mechanism — there's no reviewer queue yet, so this email IS the
 * fulfillment trigger until that exists. See README "Expert review"
 * section for what's still manual here.
 */
export async function sendExpertReviewNotification(
  details: ExpertReviewNotification
): Promise<boolean> {
  const notifyTo = process.env.REVIEW_NOTIFICATION_EMAIL;
  if (!notifyTo) {
    console.error(
      "REVIEW_NOTIFICATION_EMAIL is not set — cannot send expert review notification. " +
        "An order was paid but no one was notified. Set this env var."
    );
    return false;
  }

  const resend = getResend();

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Hibr <onboarding@resend.dev>",
    to: notifyTo,
    subject: `New expert review request — ${details.filename}`,
    text: [
      `A customer has paid for expert human review.`,
      ``,
      `Document: ${details.filename}`,
      `Word count: ${details.wordCount.toLocaleString()}`,
      `Review fee paid: $${details.reviewFeeUsd.toFixed(2)}`,
      `Customer email: ${details.customerEmail ?? "(not provided by Stripe)"}`,
      `Stripe session: ${details.sessionId}`,
      ``,
      `Reply to the customer directly with the reviewed translation once complete.`,
    ].join("\n"),
  });

  return true;
}

export interface OrderDeliveryDetails {
  outputFilename: string;
  outputBuffer: Buffer;
  segmentCount: number;
  wantsExpertReview: boolean;
  customerEmail: string | null;
  sessionId: string;
  amountTotalUsd: number;
}

/**
 * Email the operator (you) a copy of every completed translation, with
 * the translated file attached, regardless of whether the customer's
 * browser ever loads the success page. This is what makes the webhook
 * the source of truth for "did this order actually get fulfilled,"
 * rather than depending on the customer's success-page visit.
 *
 * Deliberately a SEPARATE email from sendExpertReviewNotification: that
 * one is a "this needs your attention" flag, this one is "here is a
 * copy of what was delivered." An expert-review order triggers both.
 */
export async function sendOrderDeliveryEmail(
  details: OrderDeliveryDetails
): Promise<boolean> {
  const notifyTo = process.env.REVIEW_NOTIFICATION_EMAIL;
  if (!notifyTo) {
    console.error(
      "REVIEW_NOTIFICATION_EMAIL is not set — cannot deliver a copy of this order. " +
        "An order was paid and translated but no copy was sent anywhere. Set this env var."
    );
    return false;
  }

  const resend = getResend();

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Hibr <onboarding@resend.dev>",
    to: notifyTo,
    subject: `Order completed — ${details.outputFilename}`,
    text: [
      `A document was translated and paid for.`,
      ``,
      `File: ${details.outputFilename}`,
      `Segments translated: ${details.segmentCount}`,
      `Amount paid: $${details.amountTotalUsd.toFixed(2)}`,
      `Expert review requested: ${details.wantsExpertReview ? "Yes" : "No"}`,
      `Customer email: ${details.customerEmail ?? "(not provided by Stripe)"}`,
      `Stripe session: ${details.sessionId}`,
    ].join("\n"),
    attachments: [
      {
        filename: details.outputFilename,
        content: details.outputBuffer,
      },
    ],
  });

  return true;
}
