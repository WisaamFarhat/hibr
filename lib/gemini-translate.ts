import { TextSegment } from "./ooxml-engine";
import {
  GEMINI_INPUT_PRICE_PER_M_TOKENS,
  GEMINI_OUTPUT_PRICE_PER_M_TOKENS,
  CHARS_PER_TOKEN_ESTIMATE,
} from "./pricing-shared";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

// Conservative batch size: keeps each request well within output token
// limits and means a single bad/truncated response only risks losing a
// small slice of the document rather than the whole thing. Exported so
// lib/pricing.ts's cost estimate can derive the number of batches a
// real translation will use, instead of guessing a separate value that
// could silently drift from this one.
export const BATCH_SIZE = 80;

interface GeminiTranslateResult {
  translations: Map<string, string>;
  inputChars: number;
  outputChars: number;
}

/**
 * Translate a batch of text segments English -> Arabic using Gemini 2.5
 * Flash, asking for strict JSON so we can map translations back to the
 * original segment ids reliably (critical: order must never drift, or
 * translations land on the wrong run in the document).
 */
async function translateBatch(
  segments: TextSegment[],
  apiKey: string
): Promise<{ map: Map<string, string>; inputChars: number; outputChars: number }> {
  const payload = segments.map((s) => ({ id: s.id, text: s.text }));

  const prompt = `You are a professional English-to-Arabic document translator.

Translate the "text" field of each item below from English into Modern Standard Arabic (MSA), suitable for formal business and technical documents.

Rules:
- Preserve numbers, dates, email addresses, URLs, and proper nouns (people, companies, product names) unless they have a well-established Arabic form.
- Preserve any placeholder-looking tokens exactly as-is (e.g. {{name}}, %s, [1]).
- Do not add explanations, transliteration, or parentheticals — output only the Arabic translation.
- Maintain the same relative tone and formality as the source.
- Return ONLY a JSON array, no markdown fences, no commentary, in this exact shape:
[{"id": "seg_0", "text": "<arabic translation>"}, ...]

Items to translate:
${JSON.stringify(payload)}`;

  const inputChars = prompt.length;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText: string =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";

  const outputChars = rawText.length;

  let parsed: { id: string; text: string }[];
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Fallback: strip accidental markdown fences and retry once.
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  }

  const map = new Map<string, string>();
  for (const item of parsed) {
    if (!item || typeof item.id !== "string" || typeof item.text !== "string") {
      throw new Error(
        `Gemini returned a malformed item in the translation batch: ${JSON.stringify(item)}`
      );
    }
    map.set(item.id, item.text);
  }

  // Validate every segment we sent actually got a translation back.
  // Without this check, a dropped/merged/skipped item from the model
  // would silently leave the original English text in the final
  // document with no error surfaced anywhere — the customer (and we)
  // would have no way to know the translation was incomplete.
  const missingIds = segments
    .map((s) => s.id)
    .filter((id) => !map.has(id));

  if (missingIds.length > 0) {
    throw new Error(
      `Gemini response is missing translations for ${missingIds.length} of ${segments.length} segments in this batch (ids: ${missingIds.slice(0, 5).join(", ")}${missingIds.length > 5 ? "…" : ""}). Refusing to return a partial translation.`
    );
  }

  return { map, inputChars, outputChars };
}

/**
 * Translate all segments in a document, batching to control request size.
 * Batches run sequentially to stay well under rate limits; can be
 * parallelized later with a concurrency cap once usage justifies it.
 *
 * Each batch gets one retry on failure (including the strict
 * "missing translations" validation in translateBatch) before giving
 * up on the whole document — a single transient bad response from
 * Gemini shouldn't fail an otherwise-fine translation, but we still
 * want to fail loudly rather than ever return a partial result.
 */
export async function translateSegments(
  segments: TextSegment[],
  apiKey: string
): Promise<GeminiTranslateResult> {
  const translations = new Map<string, string>();
  let inputChars = 0;
  let outputChars = 0;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    let result: { map: Map<string, string>; inputChars: number; outputChars: number };
    try {
      result = await translateBatch(batch, apiKey);
    } catch (firstErr) {
      console.error(
        `Translation batch ${i}-${i + batch.length} failed, retrying once:`,
        firstErr
      );
      try {
        result = await translateBatch(batch, apiKey);
      } catch (secondErr: any) {
        throw new Error(
          `Translation failed for segments ${i}-${i + batch.length} after retry: ${secondErr.message}`
        );
      }
    }

    for (const [id, text] of result.map) {
      translations.set(id, text);
    }
    inputChars += result.inputChars;
    outputChars += result.outputChars;
  }

  return { translations, inputChars, outputChars };
}

/**
 * Rough cost estimate based on Gemini 2.5 Flash pricing.
 * Character counts are converted to tokens at ~4 chars/token (English)
 * which is a standard approximation; Arabic output tends to run fewer
 * chars/token but we bias conservative (i.e. slightly overestimate cost)
 * by using the same ratio for both directions.
 */
export function estimateCostUsd(inputChars: number, outputChars: number): number {
  const inputTokens = inputChars / CHARS_PER_TOKEN_ESTIMATE;
  const outputTokens = outputChars / CHARS_PER_TOKEN_ESTIMATE;
  return (
    (inputTokens / 1_000_000) * GEMINI_INPUT_PRICE_PER_M_TOKENS +
    (outputTokens / 1_000_000) * GEMINI_OUTPUT_PRICE_PER_M_TOKENS
  );
}
