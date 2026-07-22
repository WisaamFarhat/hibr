import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  _resend = new Resend(key);
  return _resend;
}

export interface OrderDeliveryDetails {
  outputFilename: string;
  outputBuffer: Buffer;
  segmentCount: number;
  customerEmail: string | null;
  sessionId: string;
  amountTotalAed: number;
  wordCount: number;
}

/**
 * Email the operator a copy of every completed translation with the
 * file attached. Expert review is always included — no separate
 * notification needed, just the file and customer details.
 */
export async function sendOrderDeliveryEmail(details: OrderDeliveryDetails): Promise<boolean> {
  const notifyTo = process.env.REVIEW_NOTIFICATION_EMAIL;
  if (!notifyTo) {
    console.error("REVIEW_NOTIFICATION_EMAIL is not set — no copy of this order was sent.");
    return false;
  }

  const resend = getResend();

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Hibr <onboarding@resend.dev>",
    to: notifyTo,
    subject: `New order — ${details.outputFilename} (review needed)`,
    text: [
      `A new translation order is ready for your review.`,
      ``,
      `Document: ${details.outputFilename}`,
      `Word count: ${details.wordCount.toLocaleString()}`,
      `Amount paid: AED ${details.amountTotalAed.toFixed(2)}`,
      `Customer email: ${details.customerEmail ?? "(not provided by Stripe)"}`,
      `Stripe session: ${details.sessionId}`,
      ``,
      `The machine translation is attached. Review it and reply to the customer directly if anything needs adjusting.`,
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
