import { detectFormat, SupportedFormat } from "./translate-document";
import { extractSegmentsForPricing, computePriceEstimate, PriceEstimate } from "./pricing";
import { MAX_SEGMENT_COUNT, MAX_FILE_SIZE_BYTES } from "./pricing-shared";

/**
 * Result of validating + pricing an uploaded file, shared by
 * /api/estimate and /api/checkout (which previously duplicated this
 * entire sequence almost line-for-line — see the bug audit history in
 * README.md for why that duplication was worth fixing: a validation
 * rule added to one route but not the other is exactly the kind of gap
 * that's easy to introduce silently).
 *
 * Either `error` is set (with the exact NextResponse-ready status code
 * and message the route should return immediately) or all the other
 * fields are populated and the route can proceed.
 */
export type ValidatedUpload =
  | { ok: true; format: SupportedFormat; filename: string; buffer: Buffer; estimate: PriceEstimate }
  | { ok: false; status: number; error: string };

export async function validateAndPriceUpload(file: File | null): Promise<ValidatedUpload> {
  if (!file) {
    return { ok: false, status: 400, error: "No file provided" };
  }

  const format = detectFormat(file.name);
  if (!format) {
    return { ok: false, status: 400, error: "Unsupported file type. Use .docx, .pptx, or .txt" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `This file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB, limit ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB).`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let stats;
  try {
    stats = await extractSegmentsForPricing(buffer, format);
  } catch (parseErr) {
    console.error("Document parsing failed in validateAndPriceUpload:", parseErr);
    return {
      ok: false,
      status: 400,
      error: "We couldn't read this file. Make sure it's a valid, uncorrupted .docx, .pptx, or .txt file.",
    };
  }

  const { segmentCount, sourceCharCount, sourceWordCount } = stats;

  if (segmentCount === 0) {
    return { ok: false, status: 400, error: "No translatable text found in this document." };
  }

  if (segmentCount > MAX_SEGMENT_COUNT) {
    return {
      ok: false,
      status: 400,
      error: `This document is too large to translate in one pass (${segmentCount.toLocaleString()} text segments, limit ${MAX_SEGMENT_COUNT.toLocaleString()}). Try splitting it into smaller files.`,
    };
  }

  const estimate = computePriceEstimate(sourceCharCount, segmentCount, sourceWordCount);

  return { ok: true, format, filename: file.name, buffer, estimate };
}
