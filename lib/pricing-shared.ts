/**
 * Pricing model for individuals/SMEs: simple, transparent, pay-per-document.
 *
 * Two components, combined:
 *   1. A per-word rate — this is what actually scales with document size
 *      and is what most competitors (DeepL, human translation) anchor on,
 *      so it reads as familiar and fair.
 *   2. A minimum charge — covers Stripe's fixed per-transaction fee plus
 *      infra overhead on very short documents where the per-word rate
 *      alone would round to a few cents.
 *
 * The per-word rate is set well above raw Gemini cost (which is roughly
 * $0.0001-0.0002/word) specifically so it doesn't get swallowed by the
 * minimum charge until documents are absurdly short — pricing should
 * visibly scale with document size, or it doesn't feel like "pay for
 * what you use."
 *
 * This file holds only pure math with zero Node-only dependencies
 * (no `fs`, no document-parsing libraries), so it's safe to import from
 * client components (e.g. the landing-page price slider) without
 * pulling docx/pptx parsing into the browser bundle.
 */

export const PRICE_PER_WORD_USD = 0.015;
export const MINIMUM_CHARGE_USD = 0.99;

/**
 * Gemini 2.5 Flash's actual published per-million-token pricing —
 * the real cost basis behind every estimate above. This is the single
 * source of truth for these two numbers; lib/gemini-translate.ts's
 * estimateCostUsd() imports them rather than redefining them, since a
 * model swap or a price change from Google only needs to be reflected
 * in one place. If you change models or Google updates pricing, update
 * here and both the upfront customer-facing estimate and the internal
 * margin-tracking calculation stay correct together.
 */
export const GEMINI_INPUT_PRICE_PER_M_TOKENS = 0.3;
export const GEMINI_OUTPUT_PRICE_PER_M_TOKENS = 2.5;
// Standard approximation for English; used consistently wherever chars
// need to be converted to tokens for a cost estimate.
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Standard assumption for converting "pages" to "words" — used only by
 * the landing-page calculator (before any real document is parsed) so
 * a visitor can get a feel for pricing before uploading anything.
 * 500 words/page is the common convention for a typical single-spaced
 * business document (letter, contract page, report page).
 */
export const WORDS_PER_PAGE = 500;

/**
 * Expert human review add-on: a percentage of the machine-translation
 * price, not a flat or per-page fee. This scales naturally with
 * document size/cost (a reviewer spends proportionally more time on a
 * longer document) and reads simply as "+20%" rather than a separate
 * pricing model the user has to parse.
 */
export const EXPERT_REVIEW_PERCENTAGE = 0.2;

/**
 * Stripe rejects USD line items below 50 cents — without a floor here,
 * any document priced near MINIMUM_CHARGE_USD (a short document) would
 * produce a review fee under that threshold (e.g. $0.99 * 20% = $0.20),
 * which would fail checkout session creation outright for that
 * customer the moment they check the expert-review box.
 */
const EXPERT_REVIEW_MINIMUM_USD = 0.5;

export function computeExpertReviewFeeUsd(baseTranslationPriceUsd: number): number {
  const percentageFee = baseTranslationPriceUsd * EXPERT_REVIEW_PERCENTAGE;
  return Math.max(EXPERT_REVIEW_MINIMUM_USD, Math.round(percentageFee * 100) / 100);
}

/**
 * Price for an arbitrary word count, with no document involved — used
 * by the landing-page slider/calculator. Mirrors the per-word + minimum
 * logic in computePriceEstimate (lib/pricing.ts) exactly, so the number
 * a visitor sees on the slider matches what they'd actually be charged
 * for a real document of that length.
 */
export function priceForWordCount(wordCount: number): number {
  const perWordPrice = wordCount * PRICE_PER_WORD_USD;
  return Math.max(MINIMUM_CHARGE_USD, Math.round(perWordPrice * 100) / 100);
}

/**
 * Matches the `maxDuration` route segment config in
 * app/api/confirm-and-translate/route.ts and app/api/webhook/route.ts.
 * Next.js requires `maxDuration` itself to be a literal number (it's
 * statically analyzed at build time, not evaluated), so the route
 * files can't import this directly — but MAX_SEGMENT_COUNT below can,
 * which is what actually matters: the ceiling's reasoning stays tied
 * to one real number instead of a comment repeating "300" by hand.
 * If you change maxDuration in either route, update this to match.
 */
export const FUNCTION_MAX_DURATION_SECONDS = 300;

/**
 * Hard ceiling on the number of translatable text segments per
 * document. Translation batches run sequentially (lib/gemini-translate.ts,
 * BATCH_SIZE = 80 segments/call) at roughly 2-4s per call, and both
 * /api/confirm-and-translate and /api/webhook are capped at
 * FUNCTION_MAX_DURATION_SECONDS above. Without a ceiling here, a large
 * enough document could legitimately exceed that budget mid-translation
 * — after the customer has already paid — and fail with no clean
 * recovery path. 5,000 segments stays comfortably under that budget
 * (≈62 batches × ~4s ≈ 4 minutes worst case) while covering the vast
 * majority of real individual/SME documents (a 5,000-segment document
 * is roughly a 50-80 page report, well beyond a typical letter or
 * contract). Revisit this if batches are ever parallelized instead of
 * sequential, since that would raise the realistic ceiling.
 */
export const MAX_SEGMENT_COUNT = 5000;

/**
 * Hard ceiling on raw upload size in bytes, independent of segment
 * count — a document could have very few text segments (e.g. mostly
 * embedded images or large tables of numbers) while still being huge
 * in bytes, which the segment-count ceiling above wouldn't catch but
 * which still risks excessive memory use parsing the zip and slow
 * upload times for the customer. 20MB comfortably covers any realistic
 * individual/SME business document; most platforms (e.g. Vercel) also
 * enforce their own request body limits, but this gives a clear,
 * branded error message instead of relying solely on an infra-level
 * rejection the customer wouldn't understand.
 */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
