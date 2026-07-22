import * as docxEngine from "./docx-engine";
import * as pptxEngine from "./pptx-engine";
import { SupportedFormat } from "./translate-document";
import { BATCH_SIZE } from "./gemini-translate";
import {
  PRICE_PER_WORD_AED,
  MINIMUM_CHARGE_AED,
  GEMINI_INPUT_PRICE_PER_M_TOKENS,
  GEMINI_OUTPUT_PRICE_PER_M_TOKENS,
  CHARS_PER_TOKEN_ESTIMATE,
} from "./pricing-shared";

export {
  WORDS_PER_PAGE,
  priceForWordCount,
} from "./pricing-shared";

const OUTPUT_CHAR_RATIO_ESTIMATE = 1.3;

export interface PriceEstimate {
  segmentCount: number;
  sourceCharCount: number;
  sourceWordCount: number;
  estimatedGeminiCostAed: number;
  priceAed: number;
  priceCents: number; // smallest AED unit (fils) × 100 for Stripe
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function extractSegmentsForPricing(
  buffer: Buffer,
  format: SupportedFormat
): Promise<{ segmentCount: number; sourceCharCount: number; sourceWordCount: number }> {
  if (format === "docx") {
    const parsed = await docxEngine.loadDocx(buffer);
    const { segments } = docxEngine.extractTextSegments(parsed.xmlParts);
    const allText = segments.map((s) => s.text).join(" ");
    return { segmentCount: segments.length, sourceCharCount: allText.length, sourceWordCount: countWords(allText) };
  }

  if (format === "pptx") {
    const parsed = await pptxEngine.loadPptx(buffer);
    const { segments } = pptxEngine.extractTextSegments(parsed.xmlParts);
    const allText = segments.map((s) => s.text).join(" ");
    return { segmentCount: segments.length, sourceCharCount: allText.length, sourceWordCount: countWords(allText) };
  }

  if (format === "txt") {
    const text = buffer.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    return { segmentCount: lines.length, sourceCharCount: text.length, sourceWordCount: countWords(text) };
  }

  throw new Error(`Unsupported format: ${format}`);
}

export function computePriceEstimate(
  sourceCharCount: number,
  segmentCount: number,
  sourceWordCount: number
): PriceEstimate {
  const batchCount = Math.max(1, Math.ceil(segmentCount / BATCH_SIZE));
  const PROMPT_OVERHEAD_CHARS_PER_BATCH = 600;

  const estimatedInputChars = sourceCharCount + batchCount * PROMPT_OVERHEAD_CHARS_PER_BATCH;
  const estimatedOutputChars = sourceCharCount * OUTPUT_CHAR_RATIO_ESTIMATE;

  const inputTokens = estimatedInputChars / CHARS_PER_TOKEN_ESTIMATE;
  const outputTokens = estimatedOutputChars / CHARS_PER_TOKEN_ESTIMATE;

  // Gemini cost in USD, converted to AED (~3.67 rate)
  const geminiCostUsd =
    (inputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_M_TOKENS +
    (outputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_M_TOKENS;
  const estimatedGeminiCostAed = geminiCostUsd * 3.67;

  const perWordPrice = sourceWordCount * PRICE_PER_WORD_AED;
  const priceAed = Math.max(MINIMUM_CHARGE_AED, Math.round(perWordPrice * 100) / 100);

  return {
    segmentCount,
    sourceCharCount,
    sourceWordCount,
    estimatedGeminiCostAed,
    priceAed,
    priceCents: Math.round(priceAed * 100), // fils for Stripe
  };
}
