import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getPendingUpload } from "@/lib/pending-uploads";
import {
  hasDeliveryEmailBeenSent,
  markDeliveryEmailSent,
} from "@/lib/sent-email-markers";
import { translateForSession } from "@/lib/translate-for-session";
import { sendOrderDeliveryEmail } from "@/lib/notify";
import type Stripe from "stripe";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("Webhook called without signature or STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

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

      const result = await translateForSession(session.id);

      if (!hasDeliveryEmailBeenSent(session.id)) {
        const sent = await sendOrderDeliveryEmail({
          outputFilename: result.outputFilename,
          outputBuffer: result.outputBuffer,
          segmentCount: result.segmentCount,
          customerEmail,
          sessionId: session.id,
          amountTotalAed: (session.amount_total ?? 0) / 100,
          wordCount: pending?.wordCount ?? 0,
        });
        if (sent) markDeliveryEmailSent(session.id);
      }
    } catch (err: any) {
      console.error("Webhook translation/notification failed:", err);
    }
  }

  return NextResponse.json({ received: true });
}
