/**
 * Pricing model for Hibr — English to Arabic document translation.
 * Targeting UAE market, priced in AED, undercutting standard translation
 * offices (AED 30-50/page) at roughly half the market rate.
 * Expert human review is included in the base price — no add-ons, no tiers.
 */

export const PRICE_PER_WORD_AED = 0.03;
export const MINIMUM_CHARGE_AED = 10;
export const CURRENCY = "aed";
export const CURRENCY_SYMBOL = "AED";

/**
 * Gemini 2.5 Flash actual pricing — single source of truth.
 * Both gemini-translate.ts and pricing.ts import from here so a model
 * swap or Google price change only needs one edit.
 */
export const GEMINI_INPUT_PRICE_PER_M_TOKENS = 0.3;
export const GEMINI_OUTPUT_PRICE_PER_M_TOKENS = 2.5;
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Standard assumption for converting "pages" to "words" for the
 * landing-page price calculator slider.
 */
export const WORDS_PER_PAGE = 500;

/**
 * Matches the maxDuration route segment config in the API routes.
 * Next.js requires maxDuration to be a literal, so it can't import
 * this directly — but MAX_SEGMENT_COUNT is derived from it here, so
 * at least that relationship is explicit rather than a comment promise.
 * If you change maxDuration in any route, update this too.
 */
export const FUNCTION_MAX_DURATION_SECONDS = 300;

/**
 * Hard ceiling on text segments per document, sized to fit comfortably
 * within FUNCTION_MAX_DURATION_SECONDS (≈62 batches × ~4s ≈ 4 min).
 */
export const MAX_SEGMENT_COUNT = 5000;

/**
 * Hard ceiling on raw upload size before even parsing the file.
 */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function priceForWordCount(wordCount: number): number {
  const perWordPrice = wordCount * PRICE_PER_WORD_AED;
  return Math.max(MINIMUM_CHARGE_AED, Math.round(perWordPrice * 100) / 100);
}
