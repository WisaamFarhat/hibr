import * as docxEngine from "./docx-engine";
import * as pptxEngine from "./pptx-engine";
import { SupportedFormat } from "./translate-document";
import { BATCH_SIZE } from "./gemini-translate";
import {
  PRICE_PER_WORD_USD,
  MINIMUM_CHARGE_USD,
  computeExpertReviewFeeUsd,
  GEMINI_INPUT_PRICE_PER_M_TOKENS,
  GEMINI_OUTPUT_PRICE_PER_M_TOKENS,
  CHARS_PER_TOKEN_ESTIMATE,
} from "./pricing-shared";

// Re-exported for convenience so existing imports of WORDS_PER_PAGE /
// priceForWordCount / EXPERT_REVIEW_PERCENTAGE from "@/lib/pricing"
// keep working; the actual implementation lives in pricing-shared.ts
// (which has no Node-only deps, so it's also safe for client components).
export {
  WORDS_PER_PAGE,
  EXPERT_REVIEW_PERCENTAGE,
  priceForWordCount,
  computeExpertReviewFeeUsd,
} from "./pricing-shared";

// Arabic output tends to run ~1.3x the character count of English input
// for equivalent meaning (longer words, diacritics) — used only for the
// upfront estimate; the real charge after translation uses actual counts.
const OUTPUT_CHAR_RATIO_ESTIMATE = 1.3;

export interface PriceEstimate {
  segmentCount: number;
  sourceCharCount: number;
  sourceWordCount: number;
  estimatedGeminiCostUsd: number;
  priceUsd: number; // what we'll actually charge, in dollars
  priceCents: number; // for Stripe (smallest currency unit)
  expertReviewFeeUsd: number; // add-on if the user opts into expert review
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract all translatable text from a document (without calling Gemini)
 * purely to estimate cost. Reuses the same segment-extraction code path
 * that real translation will use, so the segment count matches exactly.
 */
export async function extractSegmentsForPricing(
  buffer: Buffer,
  format: SupportedFormat
): Promise<{ segmentCount: number; sourceCharCount: number; sourceWordCount: number }> {
  if (format === "docx") {
    const parsed = await docxEngine.loadDocx(buffer);
    const { segments } = docxEngine.extractTextSegments(parsed.xmlParts);
    const allText = segments.map((s) => s.text).join(" ");
    return {
      segmentCount: segments.length,
      sourceCharCount: allText.length,
      sourceWordCount: countWords(allText),
    };
  }

  if (format === "pptx") {
    const parsed = await pptxEngine.loadPptx(buffer);
    const { segments } = pptxEngine.extractTextSegments(parsed.xmlParts);
    const allText = segments.map((s) => s.text).join(" ");
    return {
      segmentCount: segments.length,
      sourceCharCount: allText.length,
      sourceWordCount: countWords(allText),
    };
  }

  if (format === "txt") {
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    return {
      segmentCount: lines.length,
      sourceCharCount: text.length,
      sourceWordCount: countWords(text),
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}

export function computePriceEstimate(
  sourceCharCount: number,
  segmentCount: number,
  sourceWordCount: number
): PriceEstimate {
  // Rough proxy for the prompt overhead per batch (instructions + JSON
  // scaffolding) so the estimate isn't naively just "input chars" —
  // matches the real shape of calls made in gemini-translate.ts.
  const batchCount = Math.max(1, Math.ceil(segmentCount / BATCH_SIZE));
  const PROMPT_OVERHEAD_CHARS_PER_BATCH = 600;

  const estimatedInputChars =
    sourceCharCount + batchCount * PROMPT_OVERHEAD_CHARS_PER_BATCH;
  const estimatedOutputChars = sourceCharCount * OUTPUT_CHAR_RATIO_ESTIMATE;

  const inputTokens = estimatedInputChars / CHARS_PER_TOKEN_ESTIMATE;
  const outputTokens = estimatedOutputChars / CHARS_PER_TOKEN_ESTIMATE;

  const estimatedGeminiCostUsd =
    (inputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_M_TOKENS +
    (outputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_M_TOKENS;

  const perWordPrice = sourceWordCount * PRICE_PER_WORD_USD;
  const priceUsd = Math.max(MINIMUM_CHARGE_USD, Math.round(perWordPrice * 100) / 100);

  return {
    segmentCount,
    sourceCharCount,
    sourceWordCount,
    estimatedGeminiCostUsd,
    priceUsd,
    priceCents: Math.round(priceUsd * 100),
    expertReviewFeeUsd: computeExpertReviewFeeUsd(priceUsd),
  };
}
