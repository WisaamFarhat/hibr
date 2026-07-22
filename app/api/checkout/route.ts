import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { validateAndPriceUpload } from "@/lib/validate-upload";
import { putPendingUpload } from "@/lib/pending-uploads";
import { CURRENCY } from "@/lib/pricing-shared";

// Translation can take a while for larger documents. Next.js requires
// this to be a literal — update FUNCTION_MAX_DURATION_SECONDS in
// lib/pricing-shared.ts if you change this value.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    const validated = await validateAndPriceUpload(file);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const { format, filename, buffer, estimate } = validated;
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            unit_amount: estimate.priceCents,
            product_data: {
              name: `Translate "${filename}" to Arabic`,
              description: `${estimate.sourceWordCount} words · AI translation + human linguist review included`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    });

    putPendingUpload(
      session.id,
      buffer,
      filename,
      format,
      estimate.sourceWordCount
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
