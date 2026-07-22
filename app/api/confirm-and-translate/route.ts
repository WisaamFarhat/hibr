import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { translateForSession } from "@/lib/translate-for-session";

// Translation can take a while for larger documents (many sequential
// Gemini batch calls). Next.js requires this to be a literal — it
// can't import FUNCTION_MAX_DURATION_SECONDS from lib/pricing-shared.ts
// — so if you change this value, update that constant too (it's what
// MAX_SEGMENT_COUNT's size ceiling is actually derived from).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed", status: session.payment_status },
        { status: 402 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server is missing GEMINI_API_KEY" }, { status: 500 });
    }

    let result;
    try {
      result = await translateForSession(sessionId);
    } catch (err: any) {
      if (err.message === "PENDING_FILE_NOT_FOUND") {
        return NextResponse.json(
          {
            error:
              "Payment confirmed, but the original file has expired on our end. Contact support with this session ID — you will not be charged again.",
            sessionId,
          },
          { status: 410 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      filename: result.outputFilename,
      fileBase64: result.outputBuffer.toString("base64"),
      segmentCount: result.segmentCount,
      wantsExpertReview: result.wantsExpertReview,
    });
  } catch (err: any) {
    console.error("Confirm/translate error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Something went wrong completing your translation" },
      { status: 500 }
    );
  }
}
