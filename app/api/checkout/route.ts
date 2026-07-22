import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { validateAndPriceUpload } from "@/lib/validate-upload";
import { putPendingUpload } from "@/lib/pending-uploads";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    // Comes from the client as a string ("true"/"false") since FormData
    // only carries strings/Blobs — never trust it for the actual amount
    // charged, only as "did they ask for this add-on," with the fee
    // itself always recomputed below from the server-derived base price.
    const wantsExpertReview = formData.get("wantsExpertReview") === "true";

    const validated = await validateAndPriceUpload(file);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const { format, filename, buffer, estimate } = validated;

    const origin = req.headers.get("origin") ?? new URL(req.url).origin;

    const lineItems: Array<{
      price_data: {
        currency: string;
        unit_amount: number;
        product_data: { name: string; description: string };
      };
      quantity: number;
    }> = [
      {
        price_data: {
          currency: "usd",
          unit_amount: estimate.priceCents,
          product_data: {
            name: `Translate "${filename}" to Arabic`,
            description: `${estimate.sourceWordCount} words · ${estimate.segmentCount} text segments`,
          },
        },
        quantity: 1,
      },
    ];

    if (wantsExpertReview) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: Math.round(estimate.expertReviewFeeUsd * 100),
          product_data: {
            name: "Expert human review",
            description: "A native Arabic linguist reviews the machine translation for accuracy and tone",
          },
        },
        quantity: 1,
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    });

    // Stash the file now, keyed by the session id we just minted, so the
    // webhook (or the success page polling) can retrieve it once payment
    // is confirmed without asking the user to re-upload.
    putPendingUpload(
      session.id,
      buffer,
      filename,
      format,
      wantsExpertReview,
      estimate.sourceWordCount,
      wantsExpertReview ? estimate.expertReviewFeeUsd : 0
    );

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Could not start checkout" },
      { status: 500 }
    );
  }
}
