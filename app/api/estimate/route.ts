import { NextRequest, NextResponse } from "next/server";
import { validateAndPriceUpload } from "@/lib/validate-upload";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    const validated = await validateAndPriceUpload(file);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const { format, estimate } = validated;

    return NextResponse.json({
      format,
      segmentCount: estimate.segmentCount,
      wordCount: estimate.sourceWordCount,
      priceUsd: estimate.priceUsd,
      priceCents: estimate.priceCents,
      expertReviewFeeUsd: estimate.expertReviewFeeUsd,
    });
  } catch (err: any) {
    console.error("Estimate error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Could not read this document" },
      { status: 500 }
    );
  }
}
